// 状态规则层：断点演练 / 隔离 / 恢复的合法性与状态迁移。
// 纯函数：输入当前状态，返回 { ok:true, state: 完整新状态 } 或 { ok:false, reason }。
// 不触碰 DOM 与存储；任何迁移都是整体替换，不存在部分改动。
import { simulateOutage, isolate, isCoreRouter } from './graph.js';

// state 形状：{ graph, snapshot, drill }
//   graph    当前拓扑
//   snapshot 最近一次隔离前的快照（只保留一份，可为空）
//   drill    进行中的预演结果（可为空）

const reject = (reason) => ({ ok: false, reason });

const clone = (graph) => JSON.parse(JSON.stringify(graph));

// 预演：只计算影响，不改动当前图。
export function planDrill(state, targetId) {
  if (!targetId) return reject('未选择设备：请先在图中选择要演练的设备');
  const target = state.graph.nodes.find((n) => n.id === targetId);
  if (!target) return reject('未选择设备：所选设备已不在图中');
  if (isCoreRouter(target)) return reject('核心路由器不允许作为断点演练目标');
  const sim = simulateOutage(state.graph, targetId);
  const drill = {
    targetId,
    targetName: target.name,
    downEdges: sim.downEdges,
    stranded: sim.stranded.map((n) => ({ id: n.id, name: n.name, type: n.type })),
  };
  return { ok: true, state: { ...state, drill } };
}

// 确认隔离：一次性应用，并把改动前的图存为最近快照（覆盖旧快照）。
export function applyDrill(state) {
  if (!state.drill) return reject('没有待确认的预演：请先执行断点预演');
  const { targetId } = state.drill;
  if (!state.graph.nodes.some((n) => n.id === targetId))
    return reject('演练目标已不在图中，预演失效');
  const snapshot = clone(state.graph); // 改动前快照，深拷贝冻结
  const graph = isolate(state.graph, targetId);
  return { ok: true, state: { graph, snapshot, drill: null } };
}

// 恢复：只能回到最近快照；没有快照则拒绝。恢复成功后该快照被消费。
export function restoreSnapshot(state) {
  if (!state.snapshot) return reject('没有可恢复的快照');
  return { ok: true, state: { graph: state.snapshot, snapshot: null, drill: null } };
}

// 取消预演：丢弃预演结果，图保持不变。
export function cancelDrill(state) {
  if (!state.drill) return reject('当前没有进行中的预演');
  return { ok: true, state: { ...state, drill: null } };
}
