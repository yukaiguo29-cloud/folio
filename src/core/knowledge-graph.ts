import type { FolioDocument, Note } from './types';

export type KnowledgeNodeKind = 'document' | 'note' | 'excerpt' | 'tag';
export type KnowledgeEdgeKind = 'contains' | 'tagged';

export interface KnowledgeNode {
  id: string;
  kind: KnowledgeNodeKind;
  label: string;
  subtitle?: string;
  docId?: string;
  noteId?: string;
  x: number;
  y: number;
}

export interface KnowledgeEdge {
  id: string;
  source: string;
  target: string;
  kind: KnowledgeEdgeKind;
  label: string;
}

export interface KnowledgeGraphData {
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
}

export function buildKnowledgeGraph(docs: FolioDocument[], notes: Note[]): KnowledgeGraphData {
  const nodes: KnowledgeNode[] = [];
  const edges: KnowledgeEdge[] = [];
  const tags = new Set<string>();
  const documentNodes = docs.map((doc, index) => {
    const angle = (index / Math.max(1, docs.length)) * Math.PI * 2 - Math.PI / 2;
    const node: KnowledgeNode = {
      id: `doc:${doc.id}`,
      kind: 'document',
      label: doc.name,
      subtitle: `${doc.format.toUpperCase()} · ${Math.round(doc.progress * 100)}% 已读`,
      docId: doc.id,
      x: 500 + Math.cos(angle) * 270,
      y: 310 + Math.sin(angle) * 185,
    };
    nodes.push(node);
    doc.tags.forEach((tag) => tags.add(tag));
    return node;
  });
  const docById = new Map(documentNodes.map((node) => [node.docId, node]));
  notes.forEach((note, index) => {
    const parent = docById.get(note.docId);
    if (!parent) return;
    const noteAngle = (index / Math.max(1, notes.length)) * Math.PI * 2;
    const node: KnowledgeNode = {
      id: `note:${note.id}`,
      kind: note.kind === 'excerpt' ? 'excerpt' : 'note',
      label: note.kind === 'bookmark' ? `书签 · 第 ${note.anchor.page} 页` : note.anchor.quote || '无文字笔记',
      subtitle: note.body || `${parent.label} · 第 ${note.anchor.page} 页`,
      docId: note.docId,
      noteId: note.id,
      x: parent.x + Math.cos(noteAngle) * 82,
      y: parent.y + Math.sin(noteAngle) * 62,
    };
    nodes.push(node);
    edges.push({
      id: `${parent.id}-${node.id}`,
      source: parent.id,
      target: node.id,
      kind: 'contains',
      label: note.kind === 'excerpt' ? '包含摘录' : '包含笔记',
    });
  });
  const tagList = [...tags].sort((a, b) => a.localeCompare(b, 'zh'));
  tagList.forEach((tag, index) => {
    const node: KnowledgeNode = {
      id: `tag:${tag}`,
      kind: 'tag',
      label: tag,
      subtitle: `${docs.filter((doc) => doc.tags.includes(tag)).length} 份文档`,
      x: 100 + (index % 5) * 200,
      y: 74 + Math.floor(index / 5) * 45,
    };
    nodes.push(node);
    docs.filter((doc) => doc.tags.includes(tag)).forEach((doc) => {
      edges.push({
        id: `${node.id}-doc:${doc.id}`,
        source: node.id,
        target: `doc:${doc.id}`,
        kind: 'tagged',
        label: '标签关联',
      });
    });
  });
  return { nodes, edges };
}
