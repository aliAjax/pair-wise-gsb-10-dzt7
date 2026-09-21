// 图计算层：纯函数，只做拓扑计算，不依赖界面与存储，不改动入参。

export const edgeKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

// 核心路由器：显式带有 core 标记的路由器。
export const isCoreRouter = (node) =>
  !!node && node.type === 'router' && node.core === true;

export const coreRouterIds = (graph) =>
  graph.nodes.filter(isCoreRouter).map((n) => n.id);

function adjacency(graph) {
  const adj = new Map(graph.nodes.map((n) => [n.id, []]));
  for (const [a, b] of graph.edges) {
    if (adj.has(a) && adj.has(b)) {
      adj.get(a).push(b);
      adj.get(b).push(a);
    }
  }
  return adj;
}

// 从给定根节点集合出发可达的全部节点 id。
export function reachableFrom(graph, rootIds) {
  const adj = adjacency(graph);
  const seen = new Set();
  const queue = [];
  for (const id of rootIds) {
    if (adj.has(id) && !seen.has(id)) {
      seen.add(id);
      queue.push(id);
    }
  }
  while (queue.length) {
    const cur = queue.shift();
    for (const next of adj.get(cur)) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
}

// 预演：假设 target 设备及其直连链路全部中断，计算影响。
// 返回 { targetId, downEdges, stranded }，其中 stranded 为失去核心路径的设备。
// 只读计算，不改动 graph。
export function simulateOutage(graph, targetId) {
  const target = graph.nodes.find((n) => n.id === targetId);
  if (!target) return null;
  const downEdges = graph.edges.filter(
    ([a, b]) => a === targetId || b === targetId
  );
  const remaining = {
    nodes: graph.nodes.filter((n) => n.id !== targetId),
    edges: graph.edges.filter(([a, b]) => a !== targetId && b !== targetId),
  };
  const reachable = reachableFrom(remaining, coreRouterIds(remaining));
  const stranded = remaining.nodes.filter((n) => !reachable.has(n.id));
  return { targetId, downEdges, stranded };
}

// 应用隔离：返回移除目标设备及其直连链路后的新图。
export function isolate(graph, targetId) {
  return {
    nodes: graph.nodes.filter((n) => n.id !== targetId),
    edges: graph.edges.filter(([a, b]) => a !== targetId && b !== targetId),
  };
}

// 剔除悬空链路（任一端点已不存在的边），返回新图。
export function sanitize(graph) {
  const ids = new Set(graph.nodes.map((n) => n.id));
  return {
    ...graph,
    edges: graph.edges.filter(([a, b]) => ids.has(a) && ids.has(b)),
  };
}
