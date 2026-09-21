// 图计算层：纯函数，只依赖传入的图数据，不感知状态与界面

export const isCore = (node) => node?.type === 'router';

const nodeIds = (data) => new Set(data.nodes.map((n) => n.id));

// 与某设备直接相连的链路
export const linksOf = (data, id) =>
  data.edges.filter(([a, b]) => a === id || b === id);

// 从所有核心路由器出发可达的节点集合（悬空链路不参与）
export function reachableFromCore(data) {
  const ids = nodeIds(data);
  const adj = new Map(data.nodes.map((n) => [n.id, []]));
  for (const [a, b] of data.edges) {
    if (!ids.has(a) || !ids.has(b)) continue;
    adj.get(a).push(b);
    adj.get(b).push(a);
  }
  const seen = new Set();
  const queue = data.nodes.filter(isCore).map((n) => n.id);
  while (queue.length) {
    const id = queue.shift();
    if (seen.has(id)) continue;
    seen.add(id);
    for (const next of adj.get(id) || []) queue.push(next);
  }
  return seen;
}

// 隔离：移除设备及其直连链路，返回新图（不改动入参）
export function isolateNode(data, targetId) {
  return {
    nodes: data.nodes.filter((n) => n.id !== targetId),
    edges: data.edges.filter(([a, b]) => a !== targetId && b !== targetId),
  };
}

// 预演：target 及其直连链路中断后，哪些设备会失去核心路径
export function analyzeOutage(data, targetId) {
  const before = reachableFromCore(data);
  const rest = isolateNode(data, targetId);
  const after = reachableFromCore(rest);
  return {
    targetId,
    links: linksOf(data, targetId),
    affected: rest.nodes.filter((n) => before.has(n.id) && !after.has(n.id)),
  };
}

// 导出前清洗：剔除两端不全的悬空链路
export function sanitize(data) {
  const ids = nodeIds(data);
  return {
    nodes: data.nodes,
    edges: data.edges.filter(([a, b]) => ids.has(a) && ids.has(b)),
  };
}
