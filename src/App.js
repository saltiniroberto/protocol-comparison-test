import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { PROPERTY_META, OPEN_PROBLEM_META, PROTOCOLS, DIFFICULTY_LABEL, DIFFICULTY_COLOR, GROUP_META } from "./data";

// Renders a description string with [text](url) markdown links as inline <a> elements.
function parseDesc(text) {
  if (!text) return null;
  const parts = [];
  const re = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
  let last = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(
      <a
        key={m.index}
        href={m[2]}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          color:"#38BDF8", textDecoration:"underline",
          textDecorationColor:"rgba(56,189,248,0.4)",
          textUnderlineOffset:"2px",
          cursor:"pointer",
        }}
        onMouseEnter={e => e.currentTarget.style.textDecorationColor="#38BDF8"}
        onMouseLeave={e => e.currentTarget.style.textDecorationColor="rgba(56,189,248,0.4)"}
      >{m[1]}</a>
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}



// Get a comparable score for a single protocol on a single property.
// Returns null if the property has no ranking direction.
function propertyScore(val, label) {
  const pm = PROPERTY_META[label];
  if (!pm || pm.rank === "none" || !pm.rank) return null;
  if (val === undefined || val === null) return -Infinity; // missing = worst

  if (pm.type === "bool") {
    if (pm.rank === "true-better")  return val === true  ? 1 : 0;
    if (pm.rank === "false-better") return val === false ? 1 : 0;
  }
  if (pm.type === "number" && typeof val === "number") {
    // We'll return raw value; caller inverts for "lower"
    return pm.rank === "lower" ? -val : val;
  }
  if (pm.type === "string" && pm.rank === "order" && pm.order) {
    const idx = pm.order.indexOf(val);
    return idx === -1 ? -Infinity : idx;
  }
  return null;
}

// Score a protocol on a problem sub-row: absent=0 (best), difficulty 1/2/3 → -1/-2/-3
function problemScore(protocol, item) {
  const diff = item.difficulties?.[protocol.id];
  if (diff == null) return 0; // not in this desc-group
  return -diff;
}

// Lexicographic sort across ordered items.
function lexCompare(a, b, orderedItems) {
  for (const item of orderedItems) {
    let sa, sb;
    if (item.kind === "problem") {
      sa = problemScore(a, item);
      sb = problemScore(b, item);
    } else {
      const pm = PROPERTY_META[item.label];
      if (!pm || pm.rank === "none" || !pm.rank) continue;
      sa = propertyScore(a.properties[item.label], item.label);
      sb = propertyScore(b.properties[item.label], item.label);
      if (sa === null || sb === null) continue;
    }
    if (sa !== sb) return sb - sa;
  }
  return 0;
}

// For each protocol, find at which item index it first diverges from the one to its left.
function getTieBreakRow(sortedProtos, orderedItems, tab) {
  const result = {};
  for (let i = 1; i < sortedProtos.length; i++) {
    const prev = sortedProtos[i - 1];
    const curr = sortedProtos[i];
    for (let j = 0; j < orderedItems.length; j++) {
      const item = orderedItems[j];
      let sp, sc;
      if (tab === "openProblems") {
        sp = problemScore(prev, item);
        sc = problemScore(curr, item);
      } else {
        const pm = PROPERTY_META[item.label];
        if (!pm || pm.rank === "none" || !pm.rank) continue;
        sp = propertyScore(prev.properties[item.label], item.label);
        sc = propertyScore(curr.properties[item.label], item.label);
        if (sp === null || sc === null) continue;
      }
      if (sp !== sc) { result[curr.id] = j; break; }
    }
  }
  return result;
}

// Shared colour helper for property cells: same logic as problems tab
// Returns cellBg, bTop, bBot, bLeft, bRight
function getPropCellStyle(protocolId, valKey, hasVal, rowIdx, valueGroups, protocolValueGroup, sortedProtocols, colorCells, isHovRow) {
  const ROW_HUES = [210, 260, 185, 330, 220, 280, 195, 315, 240, 170];
  const baseHue = ROW_HUES[rowIdx % ROW_HUES.length];
  const shadeOffsets = [0, 30, 15, 45];

  const localGrpIdx = protocolValueGroup?.[protocolId] ?? 0;
  const grpIds = valueGroups?.[valKey] ?? [];
  const grpSize = grpIds.length;
  const isShared = grpSize > 1;

  const hue = (baseHue + shadeOffsets[localGrpIdx % shadeOffsets.length]) % 360;
  const bgAlpha = isShared ? 0.20 : 0.07;
  const brdColor = `hsla(${hue},70%,65%,0.7)`;
  const cellBgColor = `hsla(${hue},65%,65%,${bgAlpha})`;

  const showColor = hasVal && (colorCells || isHovRow);

  const sortedGrpIds = sortedProtocols.map(sp => sp.id).filter(id => grpIds.includes(id));
  const posInGrp = sortedGrpIds.indexOf(protocolId);
  const isFirstInGrp = posInGrp === 0;
  const isLastInGrp  = posInGrp === sortedGrpIds.length - 1;

  return {
    cellBg: showColor ? cellBgColor : (isHovRow ? "#111825" : "#0D0F14"),
    bTop:   showColor && isShared ? `2px solid ${brdColor}` : "1px solid #111520",
    bBot:   showColor && isShared ? `2px solid ${brdColor}` : "1px solid #111520",
    bLeft:  showColor && isShared && isFirstInGrp ? `2px solid ${brdColor}` : "none",
    bRight: showColor && isShared && isLastInGrp  ? `2px solid ${brdColor}` : "1px solid #111520",
  };
}

function getBestIds(label, values, protocols) {
  const pm = PROPERTY_META[label];
  if (!pm || pm.rank === "none" || !pm.rank) return new Set();
  const entries = protocols.map(p => ({ id:p.id, val:values[p.id] })).filter(e => e.val != null);
  if (!entries.length) return new Set();
  let best = [];
  if (pm.type === "bool") {
    const target = pm.rank === "true-better";
    best = entries.filter(e => e.val === target);
    if (!best.length || best.length === entries.length) return new Set();
  } else if (pm.type === "number") {
    const nums = entries.filter(e => typeof e.val === "number");
    if (!nums.length) return new Set();
    const bv = pm.rank === "lower" ? Math.min(...nums.map(e=>e.val)) : Math.max(...nums.map(e=>e.val));
    best = nums.filter(e => e.val === bv);
    if (best.length === nums.length) return new Set();
  } else if (pm.type === "string" && pm.rank === "order" && pm.order) {
    const ranked = entries.map(e=>({id:e.id,r:pm.order.indexOf(e.val)})).filter(e=>e.r!==-1);
    if (!ranked.length) return new Set();
    const br = Math.max(...ranked.map(e=>e.r));
    best = ranked.filter(e=>e.r===br);
    if (best.length === ranked.length) return new Set();
  }
  return new Set(best.map(e => e.id));
}

export default function App() {
  const [selected, setSelected] = useState(["paxos","raft","pbft","hotstuff","tendermint","epaxos"]);
  const [rowOrders, setRowOrders] = useState({ properties: null, problems: null });
  const [sortFirst, setSortFirst] = useState("properties"); // "properties" | "problems"
  const [collapsedSections, setCollapsedSections] = useState(new Set()); // "properties" | "problems"
  const toggleSection = useCallback((s) => setCollapsedSections(prev => {
    const next = new Set(prev); next.has(s) ? next.delete(s) : next.add(s); return next;
  }), []);
  const rowOrder = rowOrders[sortFirst] ?? null;
  const setRowOrder = useCallback((v) => setRowOrders(prev => ({ ...prev, [sortFirst]: v })), [sortFirst]);
  const [hoveredRow, setHoveredRow] = useState(null);
  const [hoveredCol, setHoveredCol] = useState(null);
  const [expandedRows, setExpandedRows] = useState(new Set());
  const [hiddenProps, setHiddenProps] = useState(new Set());

  const toggleHide = useCallback((label) => {
    setHiddenProps(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label); else next.add(label);
      return next;
    });
  }, []);
  const [clickRankMode, setClickRankMode] = useState(false); // click-to-rank mode
  const [colorCells, setColorCells] = useState(false); // colour-by-description mode
  const [clickRankOrder, setClickRankOrder] = useState([]); // labels in click order
  const [tooltip, setTooltip] = useState(null); // {label, desc, x, y}
  const tooltipTimer = useRef(null);
  const hideTimer = useRef(null);
  const isOverTooltip = useRef(false);
  const isOverLabel = useRef(false);

  const showTooltip = useCallback((e, label, desc) => {
    if (!desc) return;
    isOverLabel.current = true;
    clearTimeout(tooltipTimer.current);
    clearTimeout(hideTimer.current);
    const rect = e.currentTarget.getBoundingClientRect();
    tooltipTimer.current = setTimeout(() => {
      const TOOLTIP_W = 380;
      let x = rect.right + 12;
      let y = rect.top;
      if (x + TOOLTIP_W > window.innerWidth - 12) x = rect.left - TOOLTIP_W - 12;
      y = Math.min(y, window.innerHeight - 320);
      setTooltip({ label, desc, x, y });
    }, 250);
  }, []);

  const hideTooltip = useCallback(() => {
    isOverLabel.current = false;
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (!isOverTooltip.current && !isOverLabel.current) {
        clearTimeout(tooltipTimer.current);
        setTooltip(null);
      }
    }, 120);
  }, []);

  const onTooltipEnter = useCallback(() => {
    isOverTooltip.current = true;
    clearTimeout(hideTimer.current);
  }, []);

  const onTooltipLeave = useCallback(() => {
    isOverTooltip.current = false;
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (!isOverTooltip.current && !isOverLabel.current) {
        clearTimeout(tooltipTimer.current);
        setTooltip(null);
      }
    }, 120);
  }, []);

  const toggleExpand = useCallback((label) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label); else next.add(label);
      return next;
    });
  }, []);

  // Click-to-rank: enter/exit mode, record click order, apply when done
  const enterClickRank = useCallback(() => {
    setClickRankMode(true);
    setClickRankOrder([]);
  }, []);

  const exitClickRank = useCallback((items) => {
    setClickRankMode(false);
    if (clickRankOrder.length > 0) {
      // Build full order: clicked items first, then remaining in current order
      const clicked = clickRankOrder;
      const rest = (items||[]).map(i=>i.label).filter(l => !clicked.includes(l));
      setRowOrder([...clicked, ...rest]);
    }
    setClickRankOrder([]);
  }, [clickRankOrder]);

  const handleClickRank = useCallback((label, isRankable, items) => {
    if (!isRankable) return;
    setClickRankOrder(prev => {
      if (prev.includes(label)) return prev; // already ranked
      const next = [...prev, label];
      // Auto-finish when all rankable rows clicked
      const rankableLabels = (items||[]).filter(i => {
        if (i.__divider || hiddenProps.has(i.label)) return false;
        if (i.kind === "problem") return true; // all problems are rankable
        const pm = PROPERTY_META[i.label];
        return pm && pm.rank && pm.rank !== "none";
      }).map(i=>i.label);
      if (next.length >= rankableLabels.length) {
        setTimeout(() => {
          const rest = (items||[]).map(i=>i.label).filter(l => !next.includes(l));
          setRowOrder([...next, ...rest]);
          setClickRankMode(false);
          setClickRankOrder([]);
        }, 200);
      }
      return next;
    });
  }, []);

  const dragIdx = useRef(null);
  const dragOverIdx = useRef(null);
  const [dragging, setDragging] = useState(null);
  const [dragOver, setDragOver] = useState(null);

  const toggle = id => setSelected(p => p.includes(id) ? p.filter(x=>x!==id) : [...p,id]);


  const protocols = PROTOCOLS.filter(p => selected.includes(p.id));
  const total = protocols.length;

  // Build row items — always build both properties and problems
  const { propItems, probItems } = useMemo(() => {
    // ── Problems ──────────────────────────────────────────────────────────────
    const seen = {};
    protocols.forEach(p => {
      Object.entries(p.openProblems ?? {}).forEach(([problemName, entry]) => {
        if (!seen[problemName]) seen[problemName] = {};
        seen[problemName][p.id] = { difficulty: entry.difficulty ?? 1, desc: entry.desc ?? null };
      });
    });
    const descColorMap = {};
    let colorCounter = 0;
    Object.values(seen).forEach(allProtocolData => {
      Object.values(allProtocolData).forEach(({ desc }) => {
        const key = desc ?? "";
        if (!(key in descColorMap)) descColorMap[key] = colorCounter++;
      });
    });
    const probItems = Object.entries(seen).map(([problemName, allProtocolData]) => {
      const affected = protocols.filter(p => allProtocolData[p.id] != null);
      const count = affected.length;
      const maxDiff = Math.max(...affected.map(p => allProtocolData[p.id].difficulty));
      const groupKey = count === total ? (maxDiff >= 3 ? "unique" : maxDiff >= 2 ? "partial" : "all")
        : count === 1 ? "unique" : "partial";
      const descGroups = {};
      affected.forEach(p => {
        const d = allProtocolData[p.id].desc ?? "";
        if (!descGroups[d]) descGroups[d] = [];
        descGroups[d].push(p.id);
      });
      const protocolDescGroup = {};
      affected.forEach(p => { protocolDescGroup[p.id] = descColorMap[allProtocolData[p.id].desc ?? ""]; });
      return {
        label: problemName, problemName, allProtocolData, descGroups, protocolDescGroup,
        count, groupKey, kind: "problem", bestIds: new Set(),
        difficulties: Object.fromEntries(affected.map(p => [p.id, allProtocolData[p.id].difficulty])),
      };
    });

    // ── Properties ────────────────────────────────────────────────────────────
    const map = {};
    protocols.forEach(p => {
      Object.entries(p.properties).forEach(([label, val]) => {
        if (!PROPERTY_META[label]) return;
        if (!map[label]) map[label] = { label, values:{}, kind:"bool" };
        map[label].values[p.id] = val;
        if (typeof val === "number") map[label].kind = "numeric";
        else if (typeof val === "string") map[label].kind = "string";
      });
    });
    const propItems = Object.values(map).map(row => {
      const bestIds = getBestIds(row.label, row.values, protocols);
      const valueGroups = {};
      protocols.forEach(p => {
        const v = row.values[p.id];
        if (v === undefined || v === null) return;
        const key = String(v);
        if (!valueGroups[key]) valueGroups[key] = [];
        valueGroups[key].push(p.id);
      });
      const protocolValueGroup = {};
      Object.values(valueGroups).forEach((ids, gi) => ids.forEach(id => { protocolValueGroup[id] = gi; }));
      if (row.kind === "numeric") {
        const ids = new Set(protocols.filter(p=>typeof row.values[p.id]==="number").map(p=>p.id));
        return { ...row, ids, count:ids.size, groupKey:"numeric", bestIds, valueGroups, protocolValueGroup };
      }
      if (row.kind === "string") {
        const vals = protocols.map(p=>row.values[p.id]).filter(v=>v!=null);
        const ids = new Set(protocols.filter(p=>row.values[p.id]!=null).map(p=>p.id));
        return { ...row, ids, count:ids.size, groupKey:"string", allSame:new Set(vals).size===1, bestIds, valueGroups, protocolValueGroup };
      }
      const trueIds = new Set(protocols.filter(p=>row.values[p.id]===true).map(p=>p.id));
      const count = trueIds.size;
      const groupKey = total<=1?"all": count===total?"all": count===1?"unique": count===0?"unique":"partial";
      return { ...row, ids:trueIds, count, groupKey, bestIds, valueGroups, protocolValueGroup };
    });
    return { propItems, probItems };
  }, [selected]);

  const baseItems = useMemo(() => [...propItems, ...probItems], [propItems, probItems]);
  const defaultItems = baseItems;

  const allItems = useMemo(() => {
    // Apply rowOrder within each section independently
    const applyOrder = (items, order) => {
      if (!order) return items;
      const byLabel = Object.fromEntries(items.map(i=>[i.label,i]));
      const inOrder = order.filter(l=>byLabel[l]).map(l=>byLabel[l]);
      const rest = items.filter(i=>!order.includes(i.label));
      return [...inOrder, ...rest];
    };
    const orderedProps = applyOrder(propItems, rowOrders.properties);
    const orderedProbs = applyOrder(probItems, rowOrders.problems);
    const result = [];
    // Properties section
    const visProps = orderedProps.filter(i => !hiddenProps.has(i.label));
    const hidProps = orderedProps.filter(i => hiddenProps.has(i.label));
    result.push({ __divider: true, key: "properties", label: "PROPERTIES", collapsible: true });
    if (!collapsedSections.has("properties")) result.push(...visProps);
    // Problems section
    const visProbs = orderedProbs.filter(i => !hiddenProps.has(i.label));
    result.push({ __divider: true, key: "problems", label: "OPEN PROBLEMS", collapsible: true });
    if (!collapsedSections.has("problems")) result.push(...visProbs);
    // Hidden
    if (hidProps.length) {
      result.push({ __divider: true, key: "hidden", label: "HIDDEN" });
      result.push(...hidProps);
    }
    return result;
  }, [propItems, probItems, rowOrders, hiddenProps, collapsedSections]);

  // rankItems: sortFirst section first, then the other — respects drag order
  const rankItems = useMemo(() => {
    const applyOrder = (items, order) => {
      if (!order) return items;
      const byLabel = Object.fromEntries(items.map(i => [i.label, i]));
      const inOrder = order.filter(l => byLabel[l]).map(l => byLabel[l]);
      const rest = items.filter(i => !order.includes(i.label));
      return [...inOrder, ...rest];
    };
    const props = applyOrder(propItems, rowOrders.properties).filter(i => !hiddenProps.has(i.label));
    const probs = applyOrder(probItems, rowOrders.problems).filter(i => !hiddenProps.has(i.label));
    return sortFirst === "properties" ? [...props, ...probs] : [...probs, ...props];
  }, [propItems, probItems, rowOrders, hiddenProps, sortFirst]);

  // Lexicographic sort of protocol columns — always active
  const sortedProtocols = useMemo(() => {
    return [...protocols].sort((a,b) => lexCompare(a, b, rankItems));
  }, [protocols, rankItems]);

  const rankPos = useMemo(() => {
    const pos={};
    sortedProtocols.forEach((p,i)=>{ pos[p.id]=i; });
    return pos;
  }, [sortedProtocols]);

  // Which row index caused each protocol to separate from its left neighbour
  const rankingActive = true;

  // Drag handlers
  const onDragStart = useCallback((e, idx) => {
    dragIdx.current = idx;
    setDragging(idx);
    e.dataTransfer.effectAllowed = "move";
    const ghost = document.createElement("div");
    ghost.style.cssText = "position:fixed;top:-999px;opacity:0;";
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 0, 0);
    setTimeout(() => document.body.removeChild(ghost), 0);
  }, []);

  const onDragOver = useCallback((e, idx) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverIdx.current !== idx) { dragOverIdx.current = idx; setDragOver(idx); }
  }, []);

  const onDrop = useCallback((e, idx) => {
    e.preventDefault();
    const from = dragIdx.current;
    if (from === null || from === idx) return;
    // Work only with non-divider, non-hidden labels
    // Determine which section the dragged item belongs to
    const draggedItem = allItems.find(i=>!i.__divider && i.label === allItems.filter(i=>!i.__divider)[from - allItems.slice(0,from).filter(i=>i.__divider).length]?.label);
    const section = draggedItem?.kind === "problem" ? "problems" : "properties";
    const sectionItems = section === "problems" ? probItems : propItems;
    const cur = sectionItems.filter(i => !hiddenProps.has(i.label)).map(i=>i.label);
    // Map real indices (excluding dividers/hidden) back from display idx
    const dispItems = allItems;
    const fromLabel = dispItems[from]?.label;
    const toLabel   = dispItems[idx]?.label;
    if (!fromLabel || !toLabel || fromLabel === toLabel) return;
    const next = [...cur];
    const fi = next.indexOf(fromLabel), ti = next.indexOf(toLabel);
    if (fi === -1 || ti === -1) return;
    next.splice(fi, 1);
    next.splice(ti, 0, fromLabel);
    // Append hidden labels at end to preserve them in rowOrder
    const hiddenLabels = [...hiddenProps];
    setRowOrders(prev => ({ ...prev, [section]: [...next, ...hiddenLabels] }));
    setDragging(null); setDragOver(null);
    dragIdx.current = null; dragOverIdx.current = null;
  }, [allItems, hiddenProps]);

  const onDragEnd = useCallback(() => {
    setDragging(null); setDragOver(null);
    dragIdx.current = null; dragOverIdx.current = null;
  }, []);

  const HANDLE_W=28, LABEL_W=272, CELL_W=140, COV_W=44;
  const RANK_COLORS = ["#FACC15","#94A3B8","#CD7C3A","#4A5568","#374151","#2D3748","#1E2433"];

  return (
    <div style={{minHeight:"100vh",background:"#0D0F14",color:"#CDD5E0",fontFamily:"'DM Mono','Fira Mono',monospace",display:"flex",flexDirection:"column"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:ital,wght@0,300;0,400;0,500;1,400&family=Syne:wght@700;800&display=swap');
        * { box-sizing:border-box; margin:0; padding:0; }
        ::-webkit-scrollbar { width:5px; height:5px; }
        ::-webkit-scrollbar-track { background:#0D0F14; }
        ::-webkit-scrollbar-thumb { background:#1E2433; border-radius:3px; }
        button { cursor:pointer; border:none; background:none; font-family:inherit; }
        td, th { transition:background 0.07s; }
        .drag-handle { opacity:0; transition:opacity 0.12s; cursor:grab; }
        tr:hover .drag-handle { opacity:1; }
        .drag-handle:active { cursor:grabbing; }
      `}</style>

      {/* ── Header ── */}
      <div style={{padding:"14px 24px",borderBottom:"1px solid #161B27",display:"flex",alignItems:"center",gap:16,flexShrink:0,background:"linear-gradient(90deg,rgba(52,211,153,0.05) 0%,transparent 50%)"}}>
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <rect x="0" y="0" width="12" height="12" rx="2" fill="#34D399"/>
          <rect x="16" y="0" width="12" height="12" rx="2" fill="#34D399" opacity="0.35"/>
          <rect x="0" y="16" width="12" height="12" rx="2" fill="#34D399" opacity="0.35"/>
          <rect x="16" y="16" width="12" height="12" rx="2" fill="#34D399" opacity="0.12"/>
        </svg>
        <div>
          <h1 style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:16,color:"#EDF2F7",letterSpacing:"-0.02em"}}>Consensus Protocol Comparator</h1>
          <p style={{fontSize:9,color:"#2D3748",marginTop:2,letterSpacing:"0.1em"}}>PAXOS · RAFT · PBFT · HOTSTUFF · TENDERMINT · EPAXOS · ZAB</p>
        </div>

        <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:6}}>
          <span style={{fontSize:9,color:"#2D3748",letterSpacing:"0.1em"}}>SORT FIRST</span>
          <div style={{display:"flex",background:"#111520",borderRadius:6,padding:3,border:"1px solid #1A1F2E",gap:2}}>
            {[["properties","Properties"],["problems","Problems"]].map(([s,lbl])=>(
              <button key={s} onClick={()=>setSortFirst(s)} style={{padding:"5px 14px",borderRadius:4,fontSize:10,letterSpacing:"0.07em",fontWeight:sortFirst===s?500:400,background:sortFirst===s?"#1A2035":"transparent",color:sortFirst===s?"#EDF2F7":"#4A5568",border:sortFirst===s?"1px solid #2D3748":"1px solid transparent",transition:"all 0.12s"}}>{lbl}</button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Protocol pills ── */}
      <div style={{padding:"10px 24px",borderBottom:"1px solid #161B27",display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",flexShrink:0}}>
        <span style={{fontSize:9,color:"#2D3748",letterSpacing:"0.12em",marginRight:4}}>PROTOCOLS</span>
        {PROTOCOLS.map(p=>{
          const on=selected.includes(p.id);
          return (
            <button key={p.id} onClick={()=>toggle(p.id)} style={{display:"flex",alignItems:"center",gap:6,padding:"4px 11px",borderRadius:5,border:`1px solid ${on?"#34D39940":"#1A1F2E"}`,background:on?"rgba(52,211,153,0.07)":"transparent",color:on?"#34D399":"#4A5568",fontSize:11,fontWeight:on?500:400,letterSpacing:"0.02em",transition:"all 0.12s"}}>
              <span style={{width:11,height:11,borderRadius:3,flexShrink:0,border:`1.5px solid ${on?"#34D399":"#2D3748"}`,background:on?"#34D399":"transparent",display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.12s"}}>
                {on&&<svg width="7" height="5" viewBox="0 0 7 5"><path d="M1 2.5L2.8 4.2L6 1" stroke="#0D0F14" strokeWidth="1.5" strokeLinecap="round"/></svg>}
              </span>
              {p.name}<span style={{fontSize:9,opacity:0.4}}>{p.year}</span>
            </button>
          );
        })}
        <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:8}}>
          {!clickRankMode && (
            <button onClick={enterClickRank} style={{
              fontSize:9, color:"#FBBF24", padding:"3px 10px", borderRadius:4,
              border:"1px solid rgba(251,191,36,0.3)", background:"rgba(251,191,36,0.06)",
              letterSpacing:"0.07em", transition:"all 0.12s",
            }}>CLICK TO RANK</button>
          )}
          {clickRankMode && (
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:9,color:"#FBBF24",letterSpacing:"0.07em"}}>
                {clickRankOrder.length === 0
                  ? "CLICK ROWS IN PRIORITY ORDER"
                  : `${clickRankOrder.length} RANKED — KEEP CLICKING OR`}
              </span>
              <button onClick={()=>exitClickRank(allItems)} style={{
                fontSize:9, color:"#FACC15", padding:"3px 10px", borderRadius:4,
                border:"1px solid rgba(250,204,21,0.4)", background:"rgba(250,204,21,0.08)",
                letterSpacing:"0.07em",
              }}>DONE</button>
              <button onClick={()=>{setClickRankMode(false);setClickRankOrder([]);}} style={{
                fontSize:9, color:"#4A5568", padding:"3px 10px", borderRadius:4,
                border:"1px solid #1E2433", background:"transparent", letterSpacing:"0.07em",
              }}>CANCEL</button>
            </div>
          )}
          {true && (
            <button
              onClick={()=>setColorCells(v=>!v)}
              style={{
                fontSize:9, letterSpacing:"0.07em", padding:"3px 10px", borderRadius:4,
                border: colorCells ? "1px solid rgba(125,211,252,0.4)" : "1px solid #1E2433",
                background: colorCells ? "rgba(125,211,252,0.08)" : "transparent",
                color: colorCells ? "#7DD3FC" : "#4A5568",
                transition:"all 0.12s",
              }}>
              {colorCells ? "COLOUR ON" : "COLOUR OFF"}
            </button>
          )}
        </div>
      </div>

      {/* ── Matrix ── */}
      {total===0 ? (
        <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",color:"#2D3748"}}>
          <span style={{fontSize:11,letterSpacing:"0.1em"}}>SELECT PROTOCOLS TO COMPARE</span>
        </div>
      ) : (
        <div style={{flex:1,overflow:"auto"}}>
          <table style={{borderCollapse:"collapse",minWidth:"100%"}}>
            <thead>
              <tr>
                <th style={{position:"sticky",left:0,top:0,zIndex:13,width:HANDLE_W,minWidth:HANDLE_W,background:"#0D0F14",borderBottom:"2px solid #1E2433",borderRight:"1px solid #161B27"}}/>
                <th style={{position:"sticky",left:HANDLE_W,top:0,zIndex:13,width:LABEL_W,minWidth:LABEL_W,background:"#0D0F14",borderRight:"1px solid #161B27",borderBottom:"2px solid #1E2433",padding:"10px 16px",textAlign:"left",fontSize:9,color:"#2D3748",letterSpacing:"0.12em"}}>
                  "drag to prioritise"
                </th>
                {sortedProtocols.map((p)=>{
                  const rank=rankPos[p.id];
                  const rc=RANK_COLORS[rank]??"#2D3748";
                  const isTop=rankingActive&&rank===0;
                  return (
                    <th key={p.id}
                      onMouseEnter={()=>setHoveredCol(p.id)}
                      onMouseLeave={()=>setHoveredCol(null)}
                      style={{position:"sticky",top:0,zIndex:10,width:CELL_W,minWidth:CELL_W,background:hoveredCol===p.id?"#111825":"#0D0F14",borderBottom:"2px solid #1E2433",borderRight:"1px solid #161B27",padding:"6px 6px 8px",textAlign:"center",cursor:"default",transition:"background 0.15s"}}>
                      <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:13,color:hoveredCol===p.id?"#EDF2F7":"#718096",letterSpacing:"-0.01em"}}>{p.name}</div>
                      <div style={{fontSize:8,color:"#2D3748",marginTop:1}}>{p.year}</div>
                    </th>
                  );
                })}
                <th style={{position:"sticky",top:0,zIndex:10,width:COV_W,minWidth:COV_W,background:"#0D0F14",borderBottom:"2px solid #1E2433",padding:"8px",fontSize:9,color:"#2D3748",letterSpacing:"0.1em",textAlign:"center"}}>CVR</th>
              </tr>
            </thead>

            <tbody>
              {allItems.map((item, rowIdx) => {
                const idx = rowIdx;
                // ── Section divider ──
                if (item.__divider) {
                  const isCollapsed = item.collapsible && collapsedSections.has(item.key);
                  const isHidden = item.key === "hidden";
                  return (
                    <tr key={`divider-${item.key}`}>
                      <td colSpan={sortedProtocols.length + 3} style={{
                        padding:"6px 14px 4px",
                        background: isHidden ? "#0A0C11" : "#0F1319",
                        borderBottom:"1px solid #1A1F2E",
                        borderTop: idx > 0 ? "2px solid #1A1F2E" : "none",
                        cursor: item.collapsible ? "pointer" : "default",
                      }} onClick={item.collapsible ? () => toggleSection(item.key) : undefined}>
                        <div style={{display:"flex",alignItems:"center",gap:7}}>
                          {item.collapsible && (
                            <span style={{fontSize:9,color:"#4A5568"}}>{isCollapsed ? "▸" : "▾"}</span>
                          )}
                          <span style={{
                            fontSize:8, fontWeight:600, letterSpacing:"0.14em",
                            color: isHidden ? "#2D3748" : "#34D39950",
                          }}>{item.label}</span>
                          {item.collapsible && isCollapsed && (
                            <span style={{fontSize:8,color:"#1E2433",letterSpacing:"0.08em"}}>— COLLAPSED</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                }

                const {label,ids,count,kind,values,allSame,bestIds,groupKey,
                       problemName,allProtocolData,descGroups,protocolDescGroup,difficulties,
                       valueGroups,protocolValueGroup}=item;
                const isHiddenRow = hiddenProps.has(label);
                const meta=GROUP_META[groupKey]??GROUP_META.unique;
                const rowKey=`row-${idx}`;
                const isHovRow=hoveredRow===rowKey;
                const isDraggingThis=dragging===idx;
                const isDragTarget=dragOver===idx&&dragging!==idx;
                const pm=PROPERTY_META[label];
                const isRankable=item.kind==="problem" || (pm&&pm.rank&&pm.rank!=="none");
                const desc = kind !== "problem"
                  ? (pm?.desc ?? null)
                  : (OPEN_PROBLEM_META[label]?.desc ?? null);
                const hasExpandContent = desc;

                const isTieBreaker = false;
                const separatedIds = new Set();

                return (
                  <tr
                    key={label}
                    draggable={!isHiddenRow}
                    onDragStart={!isHiddenRow ? e=>onDragStart(e,idx) : undefined}
                    onDragOver={!isHiddenRow ? e=>onDragOver(e,idx) : undefined}
                    onDrop={!isHiddenRow ? e=>onDrop(e,idx) : undefined}
                    onDragEnd={!isHiddenRow ? onDragEnd : undefined}
                    onMouseEnter={()=>setHoveredRow(rowKey)}
                    onMouseLeave={()=>setHoveredRow(null)}
                    style={{opacity:isDraggingThis?0.3:(isHiddenRow?0.38:1),outline:isDragTarget?"1px solid rgba(250,204,21,0.35)":"none",transition:"opacity 0.1s"}}
                  >
                    {/* Handle */}
                    <td style={{position:"sticky",left:0,zIndex:7,width:HANDLE_W,minWidth:HANDLE_W,background:isDragTarget?"rgba(250,204,21,0.04)":(isHovRow?"#111520":"#0D0F14"),borderBottom:"1px solid #111520",borderRight:"1px solid #161B27",textAlign:"center",verticalAlign:"top",paddingTop:10,height:"auto",minHeight:36}}>
                      {!isHiddenRow&&(
                        <div className="drag-handle" style={{display:"inline-flex",flexDirection:"column",gap:2.5,padding:"4px",borderRadius:3}}>
                          {[0,1,2].map(i=>(
                            <div key={i} style={{display:"flex",gap:2.5}}>
                              {[0,1].map(j=>(
                                <div key={j} style={{width:2.5,height:2.5,borderRadius:"50%",background:"#3D4A5C"}}/>
                              ))}
                            </div>
                          ))}
                        </div>
                      )}
                    </td>

                    {/* Label */}
                    {(()=>{
                      const isExpanded = expandedRows.has(label);
                      const clickRankPos = clickRankOrder.indexOf(label);
                      const isClickRanked = clickRankPos !== -1;
                      const isNextToRank = clickRankMode && isRankable && !isClickRanked;
                      const labelColor = clickRankMode && isRankable
                        ? (isClickRanked ? "#FACC15" : (isNextToRank ? "#EDF2F7" : "#4A5568"))
                        : (isHovRow ? "#EDF2F7" : "#8899A6");
                      return (
                        <td
                          onClick={clickRankMode && isRankable ? () => handleClickRank(label, isRankable, allItems) : undefined}
                          style={{
                            position:"sticky", left:HANDLE_W, zIndex:6,
                            width:LABEL_W, minWidth:LABEL_W,
                            background:isDragTarget?"rgba(250,204,21,0.04)":(isClickRanked?"rgba(250,204,21,0.05)":(isHovRow?"#111520":"#0D0F14")),
                            borderRight:"1px solid #161B27",
                            borderBottom:"1px solid #111520",
                            borderLeft:`3px solid ${isClickRanked?"#FACC1580":(isHovRow?meta.color:meta.color+"40")}`,
                            padding: (isExpanded || kind==="problem") ? "8px 14px" : "0 14px",
                            height: (isExpanded || kind==="problem") ? "auto" : 36,
                            cursor: clickRankMode && isRankable ? "pointer" : "default",
                            transition:"background 0.07s,border-color 0.07s",
                            outline: isNextToRank && isHovRow ? `1px solid rgba(251,191,36,0.4)` : "none",
                          }}>
                          {/* Top row: rank badge, type badge, label text, buttons */}
                          <div style={{display:"flex",alignItems:"center",gap:6, minHeight:20}}>
                            {clickRankMode && isRankable && (
                              <span style={{fontSize:9,fontWeight:700,minWidth:16,flexShrink:0,color:isClickRanked?"#FACC15":"#2D3748",letterSpacing:"0.02em",fontVariantNumeric:"tabular-nums"}}>
                                {isClickRanked ? `${clickRankPos+1}` : "·"}
                              </span>
                            )}
                            {rankingActive && !clickRankMode && isRankable && (()=>{
                              const rankIdx = rankItems.findIndex(i=>i.label===label);
                              return rankIdx === -1 ? null : (
                                <span style={{fontSize:9,fontWeight:600,color:"#4A5568",minWidth:16,flexShrink:0,letterSpacing:"0.02em",fontVariantNumeric:"tabular-nums"}}>
                                  {rankIdx+1}
                                </span>
                              );
                            })()}

                            <div
                              onMouseEnter={desc && !clickRankMode ? e => showTooltip(e, problemName ?? label, desc) : undefined}
                              onMouseLeave={desc && !clickRankMode ? hideTooltip : undefined}
                              style={{
                                fontSize:11.5, color:labelColor,
                                whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis",
                                transition:"color 0.07s", flex:1,
                                cursor: desc && !clickRankMode ? "help" : "default",
                              }}>
                              {kind==="problem" ? problemName : label}
                            </div>
                            {hasExpandContent && !clickRankMode && (
                              <button onClick={e=>{e.stopPropagation();toggleExpand(label);}} title={isExpanded?"Collapse":"Show description"}
                                style={{flexShrink:0,width:16,height:16,borderRadius:3,background:isExpanded?meta.color+"30":"transparent",border:`1px solid ${isExpanded?meta.color+"80":"#2D3748"}`,color:isExpanded?meta.color:"#4A5568",fontSize:12,display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.12s",cursor:"pointer"}}>
                                {isExpanded?"−":"+"}
                              </button>
                            )}
                            {!clickRankMode && (
                              <button onClick={e=>{e.stopPropagation();toggleHide(label);}} title={isHiddenRow?"Restore":"Hide"}
                                style={{flexShrink:0,width:16,height:16,borderRadius:3,background:"transparent",border:`1px solid ${isHiddenRow?"#4A5568":"#1E2433"}`,color:isHiddenRow?"#64748B":"#2D3748",fontSize:10,display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.12s",cursor:"pointer"}}
                                onMouseEnter={e=>{e.currentTarget.style.borderColor=isHiddenRow?"#64748B":"#F87171";e.currentTarget.style.color=isHiddenRow?"#94A3B8":"#F87171";}}
                                onMouseLeave={e=>{e.currentTarget.style.borderColor=isHiddenRow?"#4A5568":"#1E2433";e.currentTarget.style.color=isHiddenRow?"#64748B":"#2D3748";}}>
                                {isHiddenRow?"↩":"×"}
                              </button>
                            )}

                          </div>
                          {/* Property / problem expanded description */}
                          {isExpanded && desc && (
                            <div style={{marginTop:7,paddingTop:7,borderTop:`1px solid ${meta.color}25`,fontSize:11,color:"#6B7A90",lineHeight:1.7,fontFamily:"system-ui,sans-serif",whiteSpace:"normal"}}>
                              {parseDesc(desc)}
                            </div>
                          )}

                        </td>
                      );
                    })()}

                    {/* Value cells */}
                    {sortedProtocols.map(p=>{
                      const val=values?.[p.id];
                      const colHov=hoveredCol===p.id;
                      const lit=isHovRow||colHov;
                      const isBest=false;
                      const isDecidingCell=rankingActive&&separatedIds.has(p.id);
                      const bestBg="rgba(250,204,21,0.1)";
                      const bestShadow=`inset 0 0 0 1.5px rgba(250,204,21,0.45)`;
                      const decidingShadow=`inset 0 0 0 1.5px rgba(250,204,21,0.2)`;

                      // ── Problem cell ──────────────────────────────────────────────
                      if(kind==="problem"){
                        const protoData = allProtocolData?.[p.id];
                        const cellDesc = protoData?.desc ?? null;
                        const cellDiff = protoData?.difficulty ?? null;
                        const cellDc   = cellDiff ? DIFFICULTY_COLOR[cellDiff] : "#2D3748";
                        const affected = protoData != null;

                        // Per-row base hues (avoids green/yellow/red)
                        const ROW_HUES = [210, 260, 185, 330, 220, 280, 195, 315, 240, 170];
                        const baseHue = ROW_HUES[rowIdx % ROW_HUES.length];

                        // Within a row: how many distinct desc groups?
                        const numGroups = descGroups ? Object.keys(descGroups).length : 1;
                        // Local desc group index for this cell (0, 1, 2…)
                        const localGrpIdx = protocolDescGroup?.[p.id] ?? 0;
                        // Group size: how many protocols share this cell's desc?
                        const grpKey = cellDesc ?? "";
                        const grpSize = descGroups?.[grpKey]?.length ?? 1;
                        const isShared = grpSize > 1;

                        // Vary hue per local group so multiple shared groups are distinguishable
                        const shadeOffsets = [0, 30, 15, 45];
                        const hue = (baseHue + shadeOffsets[localGrpIdx % shadeOffsets.length]) % 360;
                        const bgAlpha = isShared ? 0.20 : 0.07;
                        const brdColor = `hsla(${hue},70%,65%,0.7)`;
                        const cellBgColor = `hsla(${hue},65%,65%,${bgAlpha})`;

                        const showColor = affected && (colorCells || isHovRow);

                        // Band border: only for shared groups, only when colour is showing
                        // Determine if this cell is first/last in its desc group within sortedProtocols
                        const grpIds = descGroups?.[grpKey] ?? [];
                        const sortedGrpIds = sortedProtocols.map(sp => sp.id).filter(id => grpIds.includes(id));
                        const posInGrp = sortedGrpIds.indexOf(p.id);
                        const isFirstInGrp = posInGrp === 0;
                        const isLastInGrp  = posInGrp === sortedGrpIds.length - 1;

                        const bandTop    = showColor && isShared ? `2px solid ${brdColor}` : "1px solid #111520";
                        const bandBottom = showColor && isShared ? `2px solid ${brdColor}` : "1px solid #111520";
                        const bandLeft   = showColor && isShared && isFirstInGrp ? `2px solid ${brdColor}` : "none";
                        const bandRight  = showColor && isShared && isLastInGrp  ? `2px solid ${brdColor}` : "1px solid #111520";

                        return (
                          <td key={p.id} style={{
                            width:CELL_W, minWidth:CELL_W,
                            height:"auto", minHeight:36,
                            borderTop: bandTop,
                            borderBottom: bandBottom,
                            borderLeft: bandLeft,
                            borderRight: bandRight,
                            background: showColor
                              ? cellBgColor
                              : (affected ? (isDecidingCell ? "rgba(250,204,21,0.08)" : (isHovRow ? "#111825" : "#0D0F14")) : (isHovRow ? "#111520" : "#0D0F14")),
                            boxShadow: !showColor && isDecidingCell ? decidingShadow : "none",
                            verticalAlign:"top",
                            padding: affected ? "8px 12px" : "8px 6px",
                            textAlign: affected ? "left" : "center",
                            transition:"background 0.15s, border-color 0.15s",
                          }}>
                            {affected ? (
                              <div style={{display:"flex", flexDirection:"column", gap:5}}>
                                {cellDesc && (
                                  <div style={{
                                    fontSize:10.5, lineHeight:1.55,
                                    color: isHovRow ? "#94A3B8" : "#6B7A90",
                                    fontFamily:"system-ui,sans-serif",
                                    transition:"color 0.1s",
                                  }}>{cellDesc}</div>
                                )}
                                <span style={{
                                  fontSize:9.5, color:cellDc,
                                  opacity: isHovRow ? 0.8 : 0.5,
                                  fontFamily:"system-ui,sans-serif",
                                  transition:"opacity 0.1s",
                                }}>{DIFFICULTY_LABEL[cellDiff]}</span>
                              </div>
                            ) : (
                              <span style={{fontSize:10, color:"#2D3748"}}>—</span>
                            )}
                          </td>
                        );
                      }

                      // ── Numeric cell ─────────────────────────────────────
                      if(kind==="numeric"){
                        const hasVal=typeof val==="number";
                        const {cellBg:nBg,bTop:nBT,bBot:nBB,bLeft:nBL,bRight:nBR} = getPropCellStyle(p.id,String(val),hasVal,rowIdx,valueGroups,protocolValueGroup,sortedProtocols,colorCells,isHovRow);
                        return (
                          <td key={p.id} style={{width:CELL_W,minWidth:CELL_W,height:"auto",minHeight:36,borderTop:nBT,borderBottom:nBB,borderLeft:nBL,borderRight:nBR,background:isBest?bestBg:nBg,boxShadow:!isBest&&isDecidingCell?decidingShadow:"none",textAlign:"center",verticalAlign:"top",paddingTop:9,transition:"background 0.15s"}}>
                            {hasVal?<span style={{fontSize:13,fontWeight:500,color:isBest?"#FDE68A":(lit?"#BAE6FD":"#7DD3FC"),fontVariantNumeric:"tabular-nums",letterSpacing:"-0.02em"}}>{val}</span>:<span style={{fontSize:10,color:"#2D3748"}}>{val===null?"N/A":"—"}</span>}
                          </td>
                        );
                      }

                      // ── String cell ──────────────────────────────────────
                      if(kind==="string"){
                        const hasVal=val!==undefined&&val!==null;
                        const {cellBg:sBg,bTop:sBT,bBot:sBB,bLeft:sBL,bRight:sBR} = getPropCellStyle(p.id,String(val),hasVal,rowIdx,valueGroups,protocolValueGroup,sortedProtocols,colorCells,isHovRow);
                        return (
                          <td key={p.id} style={{width:CELL_W,minWidth:CELL_W,height:"auto",minHeight:36,borderTop:sBT,borderBottom:sBB,borderLeft:sBL,borderRight:sBR,background:isBest?bestBg:sBg,boxShadow:!isBest&&isDecidingCell?decidingShadow:"none",textAlign:"center",verticalAlign:"top",paddingTop:9,transition:"background 0.15s"}}>
                            {hasVal?<span style={{fontSize:11,fontWeight:500,color:isBest?"#FDE68A":(lit?"#DDD6FE":"#C4B5FD"),whiteSpace:"nowrap"}}>{val}</span>:<span style={{fontSize:10,color:"#2D3748"}}>—</span>}
                          </td>
                        );
                      }

                      // ── Bool cell ────────────────────────────────────────
                      const has=val===true,notHas=val===false;
                      return (
                        <td key={p.id} style={{width:CELL_W,minWidth:CELL_W,height:"auto",minHeight:36,borderRight:"1px solid #111520",borderBottom:"1px solid #111520",background:isBest?bestBg:(lit?"#111825":"#0D0F14"),boxShadow:!isBest&&isDecidingCell?decidingShadow:"none",textAlign:"center",verticalAlign:"top",paddingTop:9}}>
                          {has?(
                            <div style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:24,height:24,borderRadius:5,background:isBest?"rgba(250,204,21,0.2)":"rgba(52,211,153,0.12)",border:`1px solid ${isBest?"rgba(250,204,21,0.6)":"rgba(52,211,153,0.4)"}`}}>
                              <svg width="11" height="8" viewBox="0 0 11 8"><path d="M1 4L3.8 7L10 1" stroke={isBest?"#FDE68A":"#34D399"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                            </div>
                          ):notHas?(
                            <div style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:24,height:24,borderRadius:5,background:"transparent",border:`1px solid ${lit?"#2D3748":"#1A1F2E"}`}}>
                              <svg width="9" height="9" viewBox="0 0 9 9"><path d="M1.5 1.5L7.5 7.5M7.5 1.5L1.5 7.5" stroke={lit?"#4A5568":"#2D3748"} strokeWidth="1.5" strokeLinecap="round"/></svg>
                            </div>
                          ):(
                            <div style={{width:5,height:5,borderRadius:"50%",background:lit?"#2D3748":"#161B27",margin:"auto"}}/>
                          )}
                        </td>
                      );
                    })}

                    {/* Coverage / worst-difficulty column */}
                    <td style={{width:COV_W,minWidth:COV_W,height:"auto",minHeight:36,borderBottom:"1px solid #111520",background:isHovRow?"#111520":"#0D0F14",textAlign:"center",verticalAlign:"top",paddingTop:9}}>
                      {kind==="problem"?(()=>{
                        const dc = DIFFICULTY_COLOR[item.groupKey==="all"?1:item.groupKey==="partial"?2:3] ?? "#4A5568";
                        return count > 0
                          ? <span style={{fontSize:9,fontWeight:500,color:dc,letterSpacing:"0.04em"}}>{count}/{total}</span>
                          : <span style={{fontSize:10,color:"#2D3748"}}>—</span>;
                      })():kind==="numeric"||kind==="string"?(
                        <span style={{fontSize:9,color:"#4A5568",fontStyle:"italic"}}>{kind==="string"&&allSame?"≡":"~"}</span>
                      ):(
                        <span style={{fontSize:11,fontWeight:500,color:"#64748B",fontVariantNumeric:"tabular-nums"}}>{total<=1?"✓":`${count}/${total}`}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Footer ── */}
      {total>0&&(
        <div style={{padding:"7px 24px",borderTop:"1px solid #161B27",display:"flex",gap:20,alignItems:"center",flexShrink:0,background:"#0A0C11"}}>
          <span style={{fontSize:10,color:"#2D3748"}}>
            {total} protocol{total!==1?"s":""} · {propItems.length} properties · {probItems.length} problems
            {hiddenProps.size>0&&<span style={{color:"#2D3748",marginLeft:6}}> · {hiddenProps.size} hidden</span>}
          </span>

        </div>
      )}
      {/* ── Tooltip panel ── */}
      {tooltip && (
        <div
          onMouseEnter={onTooltipEnter}
          onMouseLeave={onTooltipLeave}
          style={{
            position:"fixed", left:tooltip.x, top:tooltip.y,
            width:380, maxHeight:320, zIndex:9999,
            display:"flex", flexDirection:"column",
            background:"#13171F", border:"1px solid #2A3347", borderRadius:8,
            boxShadow:"0 12px 40px rgba(0,0,0,0.75), 0 0 0 1px rgba(255,255,255,0.05)",
          }}>
          {/* Fixed header */}
          <div style={{
            padding:"13px 16px 11px",
            borderBottom:"1px solid #1E2D40",
            flexShrink:0,
          }}>
            <div style={{
              fontSize:11.5, fontWeight:600, color:"#E2E8F0",
              fontFamily:"'Syne',sans-serif", letterSpacing:"-0.01em",
            }}>{tooltip.label}</div>
          </div>
          {/* Scrollable body */}
          <div style={{
            overflowY:"auto", padding:"12px 16px 14px", flex:1,
          }}>
            <div style={{
              fontSize:11.5, color:"#8899AA", lineHeight:1.75,
              fontFamily:"system-ui,sans-serif",
            }}>
              {parseDesc(tooltip.desc)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}