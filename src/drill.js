// 状态规则层：演练/恢复的校验与状态迁移，纯函数
// 任何迁移都整体返回新状态，绝不产生部分改动
import { isCore, analyzeOutage, isolateNode } from './graph.js';

export function checkDrill(data, selectedId) {
  const node = data.nodes.find((n) => n.id === selectedId);
  if (!node) return { ok: false, reason: '未选择设备，无法预演' };
  if (isCore(node)) return { ok: false, reason: '核心路由器不可中断，请选择其他设备' };
  return { ok: true, node };
}

// 预演：只产出预览结果，不改动当前图
export function planDrill(data, selectedId) {
  const check = checkDrill(data, selectedId);
  if (!check.ok) return check;
  return { ok: true, node: check.node, preview: analyzeOutage(data, selectedId) };
}

// 确认：一次应用隔离，同时产出改动前快照（调用方整体替换状态）
export function commitDrill(data, preview) {
  return { snapshot: data, data: isolateNode(data, preview.targetId) };
}

export function checkRestore(snapshot) {
  if (!snapshot) return { ok: false, reason: '没有可恢复的快照' };
  return { ok: true };
}
