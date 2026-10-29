import { useMemo, useRef, useState } from 'react';
import { Focus, Minus, Plus, RotateCcw, Search, X } from 'lucide-react';
import { Modal, IconButton, Empty } from './shared';
import { useApp } from '../core/store';
import { repository, persist } from '../core/database';
import { navigateTo } from '../core/navigation';
import { buildKnowledgeGraph, type KnowledgeEdgeKind, type KnowledgeNode, type PersistedKnowledgeEdge } from '../core/knowledge-graph';

const width = 1000;
const height = 620;

export function KnowledgeGraph({ open, onClose }: { open: boolean; onClose: () => void }) {
  const docs = useApp((s) => s.docs);
  const notes = useApp((s) => s.notes);
  const active = useApp((s) => s.active);
  const [persistedEdges, setPersistedEdges] = useState<PersistedKnowledgeEdge[]>(() => repository.knowledgeEdges());
  const graph = useMemo(() => buildKnowledgeGraph(docs, notes, persistedEdges), [docs, notes, persistedEdges]);
  const [query, setQuery] = useState('');
  const [edgeFilter, setEdgeFilter] = useState<'all' | KnowledgeEdgeKind>('all');
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>(() => repository.graphLayout());
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [relationOpen, setRelationOpen] = useState(false);
  const [relationSource, setRelationSource] = useState('');
  const [relationTarget, setRelationTarget] = useState('');
  const [relationLabel, setRelationLabel] = useState('相关内容');
  const drag = useRef<{ type: 'canvas' | 'node'; id?: string; x: number; y: number; moved: boolean } | null>(null);
  const moved = useRef(false);
  const visibleNodes = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return graph.nodes.filter((node) => !needle || `${node.label} ${node.subtitle || ''}`.toLocaleLowerCase().includes(needle));
  }, [graph.nodes, query]);
  const visibleIds = new Set(visibleNodes.map((node) => node.id));
  const visibleEdges = graph.edges.filter(
    (edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target) && (edgeFilter === 'all' || edge.kind === edgeFilter),
  );
  const selectedRelation = selectedEdge ? graph.edges.find((edge) => edge.id === selectedEdge) : undefined;
  const nodePosition = (node: KnowledgeNode) => positions[node.id] || { x: node.x, y: node.y };
  const reset = () => {
    setView({ x: 0, y: 0, scale: 1 });
    setPositions({});
    repository.putGraphLayout({});
    persist();
  };
  const focusCurrent = () => {
    if (!active) return;
    const node = graph.nodes.find((item) => item.docId === active && item.kind === 'document');
    if (node) setView({ x: width / 2 - node.x, y: height / 2 - node.y, scale: 1.35 });
  };
  const openNode = (node: KnowledgeNode) => {
    if (node.kind === 'tag') {
      setQuery(node.label);
      return;
    }
    const doc = docs.find((item) => item.id === node.docId);
    if (!doc) return;
    const note = node.noteId ? notes.find((item) => item.id === node.noteId) : undefined;
    navigateTo(doc.id, note?.anchor || { page: doc.page, quote: '' });
    onClose();
  };
  const addRelation = () => {
    if (!relationSource || !relationTarget || relationSource === relationTarget) return;
    const edge: PersistedKnowledgeEdge = {
      id: crypto.randomUUID(), source: relationSource, target: relationTarget, kind: 'manual',
      label: relationLabel.trim() || '相关内容', created: Date.now(),
    };
    repository.putKnowledgeEdge(edge);
    persist();
    setPersistedEdges(repository.knowledgeEdges());
    setRelationOpen(false);
    setRelationSource('');
    setRelationTarget('');
  };
  const deleteRelation = () => {
    if (!selectedEdge) return;
    repository.deleteKnowledgeEdge(selectedEdge);
    persist();
    setPersistedEdges(repository.knowledgeEdges());
    setSelectedEdge(null);
  };
  return (
    <>
    <Modal open={open} onClose={onClose} title="知识关系图" wide>
      <div className="knowledge-graph-shell">
        {!graph.nodes.length ? (
          <Empty title="资料库还没有可连接的内容"><p>导入文档并添加标签、笔记或摘录后，这里会生成真实关系。</p></Empty>
        ) : (
          <>
            <div className="graph-toolbar">
              <label className="graph-search"><Search size={15} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索文档、笔记或标签…" /></label>
              <select value={edgeFilter} onChange={(e) => setEdgeFilter(e.target.value as 'all' | KnowledgeEdgeKind)}>
                <option value="all">全部关系</option><option value="contains">文档与笔记</option><option value="tagged">文档与标签</option><option value="manual">手动关系</option>
              </select>
              <button className="secondary-button graph-add-relation" onClick={() => setRelationOpen(true)}>添加关系</button>
              {selectedRelation?.kind === 'manual' && <button className="danger-button" onClick={deleteRelation}>删除选中关系</button>}
              <IconButton label="聚焦当前文档" onClick={focusCurrent}><Focus size={15} /></IconButton>
              <IconButton label="缩小" onClick={() => setView((item) => ({ ...item, scale: Math.max(0.55, item.scale - 0.12) }))}><Minus size={15} /></IconButton>
              <IconButton label="放大" onClick={() => setView((item) => ({ ...item, scale: Math.min(2.4, item.scale + 0.12) }))}><Plus size={15} /></IconButton>
              <IconButton label="重置视图" onClick={reset}><RotateCcw size={15} /></IconButton>
              <IconButton label="关闭知识关系图" onClick={onClose}><X size={15} /></IconButton>
            </div>
            <div className="graph-canvas-wrap">
              <svg
                className="knowledge-graph-canvas"
                viewBox={`0 0 ${width} ${height}`}
                onPointerDown={(event) => {
                  if (event.target !== event.currentTarget) return;
                  drag.current = { type: 'canvas', x: event.clientX, y: event.clientY, moved: false };
                  moved.current = false;
                  event.currentTarget.setPointerCapture(event.pointerId);
                }}
                onPointerMove={(event) => {
                  const state = drag.current;
                  if (!state) return;
                  const dx = event.clientX - state.x;
                  const dy = event.clientY - state.y;
                  state.x = event.clientX; state.y = event.clientY; state.moved = true;
                  moved.current = true;
                  if (state.type === 'canvas') setView((item) => ({ ...item, x: item.x + dx / item.scale, y: item.y + dy / item.scale }));
                  if (state.type === 'node' && state.id) {
                    const svg = event.currentTarget.getBoundingClientRect();
                    const current = nodePosition(graph.nodes.find((node) => node.id === state.id)!);
                    setPositions((items) => {
                      const next = { ...items, [state.id!]: { x: current.x + (dx / svg.width) * width / view.scale, y: current.y + (dy / svg.height) * height / view.scale } };
                      repository.putGraphLayout(next);
                      persist();
                      return next;
                    });
                  }
                }}
                onPointerUp={() => { drag.current = null; }}
              >
                <g transform={`translate(${view.x + width / 2 * (1 - view.scale)} ${view.y + height / 2 * (1 - view.scale)}) scale(${view.scale})`}>
                  {visibleEdges.map((edge) => {
                    const source = graph.nodes.find((node) => node.id === edge.source)!;
                    const target = graph.nodes.find((node) => node.id === edge.target)!;
                    const a = nodePosition(source); const b = nodePosition(target);
                    return <line key={edge.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={`graph-edge ${edge.kind} ${selectedEdge === edge.id ? 'selected' : ''}`} onClick={(event) => { event.stopPropagation(); setSelectedEdge(edge.id); }} />;
                  })}
                  {visibleNodes.map((node) => {
                    const point = nodePosition(node);
                    const activeNode = node.docId === active && node.kind === 'document';
                    return <g key={node.id} transform={`translate(${point.x} ${point.y})`} className={`graph-node ${node.kind} ${activeNode ? 'current' : ''}`} onPointerDown={(event) => { event.stopPropagation(); moved.current = false; drag.current = { type: 'node', id: node.id, x: event.clientX, y: event.clientY, moved: false }; }} onClick={() => { if (!moved.current) openNode(node); moved.current = false; }}>
                      <circle r={node.kind === 'document' ? 24 : node.kind === 'tag' ? 16 : 18} />
                      <text y={node.kind === 'document' ? 42 : 34}>{node.label.length > 18 ? `${node.label.slice(0, 18)}…` : node.label}</text>
                    </g>;
                  })}
                </g>
              </svg>
            </div>
            <div className="graph-legend"><span><i className="document" />文档 {docs.length}</span><span><i className="note" />笔记/摘录 {notes.length}</span><span><i className="tag" />标签 {graph.nodes.filter((node) => node.kind === 'tag').length}</span><span className="muted">拖动画布或节点 · 点击节点打开来源</span></div>
          </>
        )}
      </div>
    </Modal>
    <Modal open={relationOpen} onClose={() => setRelationOpen(false)} title="添加知识关系">
      <div className="graph-relation-form">
        <label>起点<select value={relationSource} onChange={(event) => setRelationSource(event.target.value)}><option value="">选择节点</option>{graph.nodes.map((node) => <option key={node.id} value={node.id}>{node.label}</option>)}</select></label>
        <label>终点<select value={relationTarget} onChange={(event) => setRelationTarget(event.target.value)}><option value="">选择节点</option>{graph.nodes.map((node) => <option key={node.id} value={node.id}>{node.label}</option>)}</select></label>
        <label>关系名称<input value={relationLabel} onChange={(event) => setRelationLabel(event.target.value)} placeholder="例如：相关主题" /></label>
        <div className="modal-actions"><button className="subtle-button" onClick={() => setRelationOpen(false)}>取消</button><button className="primary" onClick={addRelation}>保存关系</button></div>
      </div>
    </Modal>
    </>
  );
}
