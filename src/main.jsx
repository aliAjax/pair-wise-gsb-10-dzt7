import React,{useEffect,useMemo,useRef,useState}from'react';
import{createRoot}from'react-dom/client';
import'./styles.css';
import{sanitize,edgeKey,isCoreRouter}from'./graph.js';
import{planDrill,applyDrill,restoreSnapshot,cancelDrill}from'./drill.js';
import{loadState,saveState}from'./store.js';

const seed={nodes:[{id:'gw',name:'核心路由器',type:'router',core:true,x:470,y:220,ip:'10.0.0.1'},{id:'sw1',name:'交换机 A',type:'switch',x:250,y:370,ip:'10.0.1.1'},{id:'sw2',name:'交换机 B',type:'switch',x:690,y:370,ip:'10.0.2.1'},{id:'web',name:'Web Server',type:'server',x:100,y:520,ip:'10.0.1.10'},{id:'db',name:'Database',type:'server',x:400,y:550,ip:'10.0.1.20'},{id:'user',name:'办公终端',type:'device',x:820,y:530,ip:'10.0.2.22'}],edges:[['gw','sw1'],['gw','sw2'],['sw1','web'],['sw1','db'],['sw2','user']]};
const ICON={router:'◉',switch:'▦',server:'▣',device:'▱'};

function App(){
  const[state,setState]=useState(()=>loadState(seed));
  const[selected,setSelected]=useState(null);
  const[tool,setTool]=useState('select');
  const[notice,setNotice]=useState('');
  const[drag,setDrag]=useState(null);
  const board=useRef();
  const graph=state.graph;
  useEffect(()=>saveState(state),[state]);

  // 规则层迁移的统一入口：成功则一次性替换状态，失败只提示，不产生部分改动。
  const commit=(result,okMsg)=>{if(!result.ok){setNotice(result.reason);return false}setState(result.state);if(okMsg)setNotice(okMsg);return true};
  // 结构性修改（增删节点/链路、改类型）使进行中的预演失效；位置/名称等外观修改保留预演。
  const mutateGraph=(fn,structural=true)=>setState(s=>({...s,graph:fn(s.graph),drill:structural?null:s.drill}));

  const node=graph.nodes.find(n=>n.id===selected)||null;
  const updateNode=(k,v)=>mutateGraph(g=>({...g,nodes:g.nodes.map(n=>n.id===node.id?{...n,[k]:v}:n)}),k==='type');
  const addNodeOf=(type,label)=>{const id='node'+Date.now();mutateGraph(g=>({...g,nodes:[...g.nodes,{id,name:label,type,x:500,y:320,ip:'192.168.0.2'}]}));setSelected(id);setNotice('已添加设备')};
  const connect=()=>{if(!node)return setNotice('请先选择设备');const other=prompt('输入要连接的设备 ID（例如 sw1）');if(other&&graph.nodes.some(n=>n.id===other)&&other!==node.id&&!graph.edges.some(e=>(e[0]===node.id&&e[1]===other)||(e[1]===node.id&&e[0]===other))){mutateGraph(g=>({...g,edges:[...g.edges,[node.id,other]]}));setNotice('连接已创建')}};
  const remove=()=>{if(!node)return;mutateGraph(g=>({nodes:g.nodes.filter(n=>n.id!==node.id),edges:g.edges.filter(e=>!e.includes(node.id))}));setSelected(graph.nodes.find(n=>n.id!==node.id)?.id??null);setNotice('设备已删除')};
  const validate=()=>{const linked=new Set(graph.edges.flat());const isolated=graph.nodes.filter(n=>!linked.has(n.id));setNotice(isolated.length?`发现 ${isolated.length} 个孤立节点`:'拓扑检查通过：没有孤立节点')};
  // 导出只取当前图，并剔除悬空链路。
  const exportJson=()=>{const clean=sanitize(graph);const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(clean,null,2)],{type:'application/json'}));a.download='network-topology.json';a.click();setNotice('已导出当前拓扑（悬空链路已剔除）')};
  const save=()=>setNotice('拓扑图已保存');

  // 断点演练：预演只读当前图；确认后一次性隔离并留快照；恢复只能回最近快照。
  const startDrill=()=>{const r=planDrill(state,selected);if(commit(r)){const n=r.state.drill.stranded.length;setNotice(n?`预演完成：${n} 台设备将失去核心路径`:'预演完成：其余设备仍可到达核心')}};
  const confirmIsolation=()=>{const name=state.drill?.targetName;if(commit(applyDrill(state))){setSelected(graph.nodes.find(n=>n.id!==state.drill.targetId)?.id??null);setNotice(`已隔离 ${name}，改动前快照已保存`)}};
  const restore=()=>{if(commit(restoreSnapshot(state),'已恢复到最近快照'))setSelected(null)};
  const cancel=()=>commit(cancelDrill(state),'已取消预演');

  // 预演高亮（纯展示，不改动图）：将中断的链路、失去核心路径的设备、演练目标。
  const preview=useMemo(()=>state.drill?{target:state.drill.targetId,cut:new Set(state.drill.downEdges.map(([a,b])=>edgeKey(a,b))),stranded:new Set(state.drill.stranded.map(n=>n.id))}:null,[state.drill]);

  const move=(e)=>{if(!drag)return;const r=board.current.getBoundingClientRect();mutateGraph(g=>({...g,nodes:g.nodes.map(n=>n.id===drag?{...n,x:Math.max(35,e.clientX-r.left),y:Math.max(35,e.clientY-r.top)}:n)}),false)};

  return <div className="app"><header><div className="brand"><span className="brand-mark">⌁</span><div><strong>NETSCAPE</strong><small>TOPOLOGY STUDIO</small></div></div><div className="file"><span className="dot"></span><div><strong>office-network.json</strong><small>{state.snapshot?'快照：可恢复':'快照：无'}</small></div></div><div className="top-actions"><button onClick={validate}>✓ 检查</button><button onClick={exportJson}>↓ 导出</button><button className="save" onClick={save}>保存更改</button></div></header><div className="toolbar"><div className="tool-group"><span>工具</span><button className={tool==='select'?'on':''} onClick={()=>setTool('select')}>↖ 选择</button><button className={tool==='connect'?'on':''} onClick={()=>{setTool('connect');connect()}}>⌁ 连接</button><button onClick={()=>addNodeOf('device','新设备')}>＋ 设备</button></div><div className="tool-group zoom"><button>−</button><span>100%</span><button>＋</button><button onClick={()=>setNotice('画布已居中')}>⌗</button></div></div><div className="workspace"><aside className="inventory"><div className="section-title"><span>设备库</span><small>{graph.nodes.length} 个节点</small></div><div className="device-types">{[['router','◉','路由器'],['switch','▦','交换机'],['server','▣','服务器'],['device','▱','终端设备']].map(([t,i,l])=><button onClick={()=>addNodeOf(t,l)} key={t}><i className={t}>{i}</i>{l}<span>＋</span></button>)}</div><div className="section-title nodes-head"><span>图中节点</span><small>点击查看</small></div><div className="node-list">{graph.nodes.map(n=><button className={selected===n.id?'sel':''} onClick={()=>setSelected(n.id)} key={n.id}><i className={n.type}>{ICON[n.type]}</i><span><strong>{n.name}{isCoreRouter(n)?' · 核心':''}</strong><small>{n.ip}</small></span><b>›</b></button>)}</div></aside><section className="canvas-wrap"><div className="canvas" ref={board} onMouseMove={move} onMouseUp={()=>setDrag(null)}>{graph.edges.map(([a,b])=>{const n1=graph.nodes.find(n=>n.id===a),n2=graph.nodes.find(n=>n.id===b);if(!n1||!n2)return null;const dx=n2.x-n1.x,dy=n2.y-n1.y,len=Math.hypot(dx,dy),ang=Math.atan2(dy,dx)*180/Math.PI;return <div className={'edge'+(preview&&preview.cut.has(edgeKey(a,b))?' cut':'')} key={edgeKey(a,b)} style={{left:n1.x,top:n1.y,width:len,transform:`rotate(${ang}deg)`}}><span></span></div>})}{graph.nodes.map(n=><button className={'node '+n.type+(selected===n.id?' picked':'')+(preview&&preview.target===n.id?' outage':'')+(preview&&preview.stranded.has(n.id)?' stranded':'')} style={{left:n.x-42,top:n.y-31}} onMouseDown={e=>{e.stopPropagation();setSelected(n.id);setDrag(n.id)}} onClick={()=>setSelected(n.id)} key={n.id}><i>{ICON[n.type]}</i><strong>{n.name}</strong><small>{n.ip}</small></button>)}<div className="legend"><span><i className="router"></i>路由器</span><span><i className="switch"></i>交换机</span><span><i className="server"></i>服务器</span></div></div><div className="canvas-footer"><span>拖动节点调整位置 · {graph.edges.length} 条连接</span><span>{state.drill?`预演中：${state.drill.targetName} 中断`:'坐标系：画布局部'}</span></div></section><aside className="inspector"><div className="section-title"><span>属性</span><small>{node?node.type:'未选择'}</small></div>{node?<><label>设备名称<input value={node.name} onChange={e=>updateNode('name',e.target.value)}/></label><label>IP 地址<input value={node.ip} onChange={e=>updateNode('ip',e.target.value)}/></label><label>设备类型<select value={node.type} onChange={e=>updateNode('type',e.target.value)}><option value="router">路由器</option><option value="switch">交换机</option><option value="server">服务器</option><option value="device">终端设备</option></select></label><div className="inspector-actions"><button onClick={connect}>⌁ 添加连接</button><button className="danger" onClick={remove}>删除设备</button></div><div className="connections"><div className="section-title"><span>连接</span><small>{graph.edges.filter(e=>e.includes(node.id)).length} 条</small></div>{graph.edges.filter(e=>e.includes(node.id)).map((e,i)=>{const other=graph.nodes.find(n=>n.id===(e[0]===node.id?e[1]:e[0]));return <div className="connection" key={i}><span className={'mini '+other?.type}></span><strong>{other?.name}</strong><small>在线</small></div>})}</div></>:<p className="inspector-empty">选择一个设备</p>}<div className="drill-panel"><div className="section-title"><span>断点演练</span><small>{state.drill?'预演中':state.snapshot?'可恢复':'待命'}</small></div>{state.drill?<div className="drill-result"><div className="drill-target"><strong>⚡ {state.drill.targetName}</strong><small>{state.drill.downEdges.length} 条直连链路将中断</small></div><div className="stranded"><span>失去核心路径的设备 · {state.drill.stranded.length}</span>{state.drill.stranded.length===0?<em>无 —— 其余设备仍可到达核心</em>:state.drill.stranded.map(n=><div className="stranded-item" key={n.id}><span className={'mini '+n.type}></span>{n.name}</div>)}</div><div className="drill-actions"><button className="apply" onClick={confirmIsolation}>确认隔离</button><button onClick={cancel}>取消预演</button></div><small className="hint">预演不改动当前图；确认后一次性隔离并保存改动前快照。</small></div>:<div className="drill-idle"><button className="drill-go" onClick={startDrill}>⚡ 预演选中设备中断</button>{!node&&<small className="warn">未选择设备</small>}{node&&isCoreRouter(node)&&<small className="warn">核心路由器不可作为演练目标</small>}</div>}<button className={'restore'+(state.snapshot?'':' off')} onClick={restore}>⟲ 恢复最近快照{state.snapshot?'':'（无快照）'}</button></div></aside></div>{notice&&<div className="toast">{notice}</div>}</div>
}
createRoot(document.getElementById('root')).render(<App/>);
