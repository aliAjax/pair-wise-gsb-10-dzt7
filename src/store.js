// 持久化层：拓扑、快照、预演结果三键同写同读，保证刷新后一致。
import { sanitize, isCoreRouter } from './graph.js';

const KEYS = {
  graph: 'topology',
  snapshot: 'topology.snapshot',
  drill: 'topology.drill',
};

const read = (key) => {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
};

const validGraph = (g) =>
  g && Array.isArray(g.nodes) && Array.isArray(g.edges);

// 兼容旧数据：没有任何核心路由器时，把 gw 或第一个路由器补为核心。
function ensureCore(graph) {
  if (graph.nodes.some(isCoreRouter)) return graph;
  const pick =
    graph.nodes.find((n) => n.id === 'gw' && n.type === 'router') ||
    graph.nodes.find((n) => n.type === 'router');
  if (!pick) return graph;
  return {
    ...graph,
    nodes: graph.nodes.map((n) =>
      n.id === pick.id ? { ...n, core: true } : n
    ),
  };
}

export function loadState(seed) {
  const storedGraph = read(KEYS.graph);
  const graph = ensureCore(
    sanitize(validGraph(storedGraph) ? storedGraph : seed)
  );
  const storedSnapshot = read(KEYS.snapshot);
  const snapshot = validGraph(storedSnapshot)
    ? ensureCore(sanitize(storedSnapshot))
    : null;
  let drill = read(KEYS.drill);
  // 预演结果必须仍指向当前图中的设备，否则丢弃，保持一致性。
  if (drill && !graph.nodes.some((n) => n.id === drill.targetId)) drill = null;
  return { graph, snapshot, drill };
}

export function saveState(state) {
  try {
    localStorage.setItem(KEYS.graph, JSON.stringify(state.graph));
    if (state.snapshot)
      localStorage.setItem(KEYS.snapshot, JSON.stringify(state.snapshot));
    else localStorage.removeItem(KEYS.snapshot);
    if (state.drill)
      localStorage.setItem(KEYS.drill, JSON.stringify(state.drill));
    else localStorage.removeItem(KEYS.drill);
  } catch {
    /* 存储不可用时静默降级为内存态 */
  }
}
