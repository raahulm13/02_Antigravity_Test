"use client";

import { useState, useEffect, useMemo } from "react";
import Papa from "papaparse";
import { Download, Upload, Server, Database, FileText, Activity, ShieldCheck, RefreshCw, LayoutTemplate, Network } from "lucide-react";
import ReactFlow, { Background, Controls, MiniMap } from "reactflow";
import "reactflow/dist/style.css";

export default function Home() {
  const [activeTab, setActiveTab] = useState("feeds");
  const [viewMode, setViewMode] = useState("table"); // 'table' or 'graph'
  const [selectedEdgeData, setSelectedEdgeData] = useState<any>(null);
  const [selectedNodeData, setSelectedNodeData] = useState<any>(null);
  
  const [data, setData] = useState<any>({
    feeds: [],
    payloads: [],
    dataElements: [],
    lineage: [],
    controls: []
  });
  const [loading, setLoading] = useState(true);
  const [uploadStatus, setUploadStatus] = useState("");

  const fetchData = async () => {
    setLoading(true);
    try {
      const tabs = ["feeds", "payloads", "dataElements", "lineage", "controls"];
      const newData: any = {};
      
      for (const tab of tabs) {
        const res = await fetch(`/api/extract?type=${tab}`);
        const result = await res.json();
        if (result.success) {
          if (tab === 'controls') {
            newData[tab] = result.data.map((c: any) => ({
              ...c,
              feedName: c.feed?.feedName || '',
              nodeName: c.node?.nodeName || ''
            }));
          } else if (tab === 'feeds') {
            newData[tab] = result.data.map((f: any) => ({
              ...f,
              linkedControls: (f.controls || []).map((c: any) => c.controlName).join(', ')
            }));
          } else if (tab === 'lineage') {
            newData[tab] = {
              ...result.data,
              nodes: (result.data.nodes || []).map((n: any) => ({
                ...n,
                linkedControls: (n.controls || []).map((c: any) => c.controlName).join(', ')
              }))
            };
          } else {
            newData[tab] = result.data;
          }
        } else {
          newData[tab] = [];
        }
      }
      setData(newData);
    } catch (err) {
      console.error("Failed to fetch data", err);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadStatus("Parsing CSV...");
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        setUploadStatus(`Uploading ${results.data.length} rows to ${activeTab}...`);
        
        try {
          const res = await fetch("/api/ingest", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              entityType: activeTab,
              data: results.data
            })
          });
          
          const result = await res.json();
          if (result.success) {
            setUploadStatus(`Successfully ingested ${result.inserted} records!`);
            fetchData(); // Refresh table
            setTimeout(() => setUploadStatus(""), 3000);
          } else {
            setUploadStatus(`Error: ${result.error}`);
          }
        } catch (err) {
          setUploadStatus("Failed to upload data.");
        }
      }
    });
  };

  const exportToCSV = () => {
    const tableData = activeTab === 'lineage' ? (data.lineage?.nodes || []) : (data[activeTab] || []);
    if (!tableData || tableData.length === 0) {
      alert("No data to export");
      return;
    }
    
    // Clean nested objects before export
    const cleanData = tableData.map((row: any) => {
      const cleanRow: any = {};
      Object.keys(row).forEach(key => {
        if (typeof row[key] !== 'object' && row[key] !== null) {
          cleanRow[key] = row[key];
        }
      });
      return cleanRow;
    });

    const csv = Papa.unparse(cleanData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `${activeTab}_export.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const navItems = [
    { id: "feeds", label: "Feeds", icon: Server },
    { id: "payloads", label: "Payloads", icon: Database, isSub: true },
    { id: "dataElements", label: "Data Elements", icon: FileText, isSub: true },
    { id: "lineage", label: "Lineage", icon: Activity },
    { id: "controls", label: "Controls", icon: ShieldCheck }
  ];

  // Graph Layout calculation
  const { nodes, edges } = useMemo(() => {
    if (activeTab !== 'lineage' || !data.lineage || !data.lineage.nodes) return { nodes: [], edges: [] };

    const graphNodes: any[] = [];
    const graphEdges: any[] = [];
    const nodeLevels = new Map();
    const adjList = new Map();
    const inDegree = new Map();
    const nodeMetadata = new Map();
    const nodeControls = new Map();

    data.lineage.nodes.forEach((node: any) => {
      nodeMetadata.set(node.nodeName, node.metadata);
      nodeControls.set(node.nodeName, node.controls || []);
    });

    data.lineage.edges.forEach((edge: any) => {
      const u = edge.sourceName;
      const v = edge.targetName;
      if (!adjList.has(u)) adjList.set(u, []);
      if (!adjList.has(v)) adjList.set(v, []);
      adjList.get(u).push(v);
      
      inDegree.set(v, (inDegree.get(v) || 0) + 1);
      if (!inDegree.has(u)) inDegree.set(u, 0);

      graphEdges.push({
        id: `e-${edge.id || Math.random()}`,
        source: u,
        target: v,
        style: { stroke: '#3b82f6', strokeWidth: 2 },
        data: { feed: edge.feed }
      });
    });

    let queue: string[] = [];
    inDegree.forEach((deg, node) => {
      if (deg === 0) queue.push(node);
    });

    if (queue.length === 0 && inDegree.size > 0) {
      queue.push(inDegree.keys().next().value);
    }

    const levelCount: any = {};
    while(queue.length > 0) {
      const u = queue.shift()!;
      const level = nodeLevels.get(u) || 0;
      
      if (!levelCount[level]) levelCount[level] = 0;
      
      graphNodes.push({
        id: u,
        data: { label: u, metadata: nodeMetadata.get(u), controls: nodeControls.get(u) },
        position: { x: level * 300, y: levelCount[level] * 100 },
        sourcePosition: 'right',
        targetPosition: 'left',
        style: { background: 'rgba(30, 41, 59, 0.8)', color: '#fff', border: '1px solid #475569', borderRadius: '8px', padding: '10px' }
      });
      levelCount[level]++;

      (adjList.get(u) || []).forEach(v => {
        if (!nodeLevels.has(v)) {
          nodeLevels.set(v, level + 1);
          queue.push(v);
        }
      });
    }

    // Add remaining disconnected nodes
    data.lineage.nodes.forEach((node: any) => {
      if (!graphNodes.find(n => n.id === node.nodeName)) {
        graphNodes.push({
          id: node.nodeName,
          data: { label: node.nodeName, metadata: node.metadata, controls: node.controls || [] },
          position: { x: Math.random() * 500, y: Math.random() * 500 },
          sourcePosition: 'right',
          targetPosition: 'left',
          style: { background: 'rgba(30, 41, 59, 0.8)', color: '#fff', border: '1px solid #475569', borderRadius: '8px', padding: '10px' }
        });
      }
    });

    return { nodes: graphNodes, edges: graphEdges };
  }, [data.lineage, activeTab]);
  const tableData = activeTab === 'lineage' ? (data.lineage?.nodes || []) : (data[activeTab] || []);

  return (
    <div className="app-layout">
      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div className="sidebar-title">Cloud Data</div>
        <nav className="sidebar-nav">
          {navItems.map(tab => {
            const Icon = tab.icon;
            return (
              <button 
                key={tab.id}
                className={`sidebar-item ${tab.isSub ? 'sub-item' : ''} ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => {
                  setActiveTab(tab.id);
                  if (tab.id !== 'lineage') setViewMode('table');
                }}
              >
                <Icon size={16} /> {tab.label}
              </button>
            )
          })}
        </nav>
      </aside>

      {/* Main Content Area */}
      <main className="main-content animate-fade-in" style={{ display: 'flex', flexDirection: 'column' }}>
        <header className="flex-between" style={{ marginBottom: "2rem" }}>
          <div>
            <h1>Data Management</h1>
            <p>Ingest, persist, view, and extract enterprise data.</p>
          </div>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <button className="btn btn-outline" onClick={fetchData}>
              <RefreshCw size={16} /> Refresh
            </button>
          </div>
        </header>

        <div className="glass-panel" style={{ marginBottom: "2rem" }}>
          <div className="flex-between">
            <h2 style={{ textTransform: 'capitalize', fontSize: '1.5rem', fontWeight: 600, margin: 0 }}>
              {activeTab} Data
            </h2>
            
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              {activeTab === 'lineage' && (
                <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', overflow: 'hidden', marginRight: '1rem' }}>
                  <button 
                    onClick={() => setViewMode('table')} 
                    style={{ padding: '8px 16px', background: viewMode === 'table' ? 'var(--primary)' : 'transparent', color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <LayoutTemplate size={16}/> Table
                  </button>
                  <button 
                    onClick={() => setViewMode('graph')} 
                    style={{ padding: '8px 16px', background: viewMode === 'graph' ? 'var(--primary)' : 'transparent', color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Network size={16}/> Graph
                  </button>
                </div>
              )}
              
              <label className="btn btn-outline" style={{ cursor: 'pointer' }}>
                <Upload size={16} />
                Ingest CSV to {activeTab}
                <input type="file" accept=".csv,.xlsx,.xls" style={{ display: 'none' }} onChange={handleFileUpload} />
              </label>
              
              <button className="btn btn-primary" onClick={exportToCSV}>
                <Download size={16} /> Extract {activeTab}
              </button>
            </div>
          </div>
          
          {uploadStatus && (
            <div style={{ marginTop: '1rem', color: 'var(--success)', fontSize: '0.9rem' }}>
              {uploadStatus}
            </div>
          )}
        </div>

        <div className="glass-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {loading ? (
              <p>Loading data...</p>
            ) : tableData.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
              <Database size={48} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
              <p>No data found for {activeTab}.</p>
              <p style={{ fontSize: '0.85rem' }}>Use the "Ingest CSV" button above to upload some records.</p>
            </div>
          ) : viewMode === 'graph' && activeTab === 'lineage' ? (
            <div style={{ flex: 1, minHeight: '500px', position: 'relative' }}>
              <ReactFlow 
                nodes={nodes} 
                edges={edges}
                onNodeClick={(e, node) => {
                  setSelectedEdgeData(null);
                  setSelectedNodeData(node);
                }}
                onEdgeClick={(e, edge) => {
                  setSelectedNodeData(null);
                  setSelectedEdgeData({ source: edge.source, target: edge.target, feed: edge.data?.feed });
                }}
                fitView
              >
                <Background color="#ccc" gap={16} />
                <Controls />
                <MiniMap />
              </ReactFlow>

              {/* Edge Metadata Modal / Panel */}
              {selectedEdgeData && (
                <div style={{
                  position: 'absolute', right: '1rem', top: '1rem', width: '350px',
                  background: 'var(--bg-color)', border: '1px solid var(--surface-border)',
                  borderRadius: '12px', padding: '1.5rem', boxShadow: '0 10px 25px rgba(0,0,0,0.5)', zIndex: 10
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Edge Metadata</h3>
                    <button onClick={() => setSelectedEdgeData(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.5rem' }}>&times;</button>
                  </div>
                  <div style={{ marginBottom: '1rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                    <strong>{selectedEdgeData.source}</strong> &rarr; <strong>{selectedEdgeData.target}</strong>
                  </div>
                  
                  <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                    {selectedEdgeData.feed ? (
                      <table style={{ width: '100%', fontSize: '0.85rem' }}>
                        <tbody>
                          <tr style={{ borderBottom: '1px solid var(--surface-border)' }}>
                            <td style={{ padding: '8px 0', fontWeight: 500, color: 'var(--text-secondary)', width: '40%' }}>Feed Name</td>
                            <td style={{ padding: '8px 0', wordBreak: 'break-all' }}>{selectedEdgeData.feed.feedName}</td>
                          </tr>
                          <tr style={{ borderBottom: '1px solid var(--surface-border)' }}>
                            <td style={{ padding: '8px 0', fontWeight: 500, color: 'var(--text-secondary)', width: '40%' }}>Protocol</td>
                            <td style={{ padding: '8px 0', wordBreak: 'break-all' }}>{selectedEdgeData.feed.protocol}</td>
                          </tr>
                          <tr style={{ borderBottom: '1px solid var(--surface-border)' }}>
                            <td style={{ padding: '8px 0', fontWeight: 500, color: 'var(--text-secondary)', width: '40%' }}>Status</td>
                            <td style={{ padding: '8px 0', wordBreak: 'break-all' }}>{selectedEdgeData.feed.status}</td>
                          </tr>
                          {selectedEdgeData.feed.controls && selectedEdgeData.feed.controls.length > 0 && (
                            <tr style={{ borderBottom: '1px solid var(--surface-border)' }}>
                              <td style={{ padding: '8px 0', fontWeight: 500, color: 'var(--text-secondary)', width: '40%' }}>Linked Controls</td>
                              <td style={{ padding: '8px 0', wordBreak: 'break-all' }}>
                                <ul style={{ margin: 0, paddingLeft: '1rem' }}>
                                  {selectedEdgeData.feed.controls.map((c: any) => (
                                    <li key={c.id}>
                                      <strong>{c.controlName}</strong> ({c.complianceStatus})
                                    </li>
                                  ))}
                                </ul>
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    ) : (
                      <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>No linked feed found.</p>
                    )}
                  </div>
                </div>
              )}

              {/* Node Metadata Modal / Panel */}
              {selectedNodeData && (
                <div style={{
                  position: 'absolute', right: '1rem', top: '1rem', width: '350px',
                  background: 'var(--bg-color)', border: '1px solid var(--surface-border)',
                  borderRadius: '12px', padding: '1.5rem', boxShadow: '0 10px 25px rgba(0,0,0,0.5)', zIndex: 10
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Node Attributes</h3>
                    <button onClick={() => setSelectedNodeData(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.5rem' }}>&times;</button>
                  </div>
                  <div style={{ marginBottom: '1rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                    <strong>{selectedNodeData.data?.label || selectedNodeData.id}</strong>
                  </div>
                  
                  <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                    <table style={{ width: '100%', fontSize: '0.85rem' }}>
                      <tbody>
                        <tr style={{ borderBottom: '1px solid var(--surface-border)' }}>
                          <td style={{ padding: '8px 0', fontWeight: 500, color: 'var(--text-secondary)', width: '40%' }}>Node ID</td>
                          <td style={{ padding: '8px 0', wordBreak: 'break-all' }}>{selectedNodeData.id}</td>
                        </tr>
                        <tr style={{ borderBottom: '1px solid var(--surface-border)' }}>
                          <td style={{ padding: '8px 0', fontWeight: 500, color: 'var(--text-secondary)', width: '40%' }}>Incoming Edges</td>
                          <td style={{ padding: '8px 0', wordBreak: 'break-all' }}>
                            {edges.filter(e => e.target === selectedNodeData.id).length}
                          </td>
                        </tr>
                        <tr style={{ borderBottom: '1px solid var(--surface-border)' }}>
                          <td style={{ padding: '8px 0', fontWeight: 500, color: 'var(--text-secondary)', width: '40%' }}>Outgoing Edges</td>
                          <td style={{ padding: '8px 0', wordBreak: 'break-all' }}>
                            {edges.filter(e => e.source === selectedNodeData.id).length}
                          </td>
                        </tr>
                        {selectedNodeData.data?.controls && selectedNodeData.data.controls.length > 0 && (
                          <tr style={{ borderBottom: '1px solid var(--surface-border)' }}>
                            <td style={{ padding: '8px 0', fontWeight: 500, color: 'var(--text-secondary)', width: '40%' }}>Linked Controls</td>
                            <td style={{ padding: '8px 0', wordBreak: 'break-all' }}>
                              <ul style={{ margin: 0, paddingLeft: '1rem' }}>
                                {selectedNodeData.data.controls.map((c: any) => (
                                  <li key={c.id}>
                                    <strong>{c.controlName}</strong> ({c.complianceStatus})
                                  </li>
                                ))}
                              </ul>
                            </td>
                          </tr>
                        )}
                        {selectedNodeData.data?.metadata && (() => {
                          try {
                            const parsed = JSON.parse(selectedNodeData.data.metadata);
                            return Object.entries(parsed).map(([key, value]) => (
                              <tr key={key} style={{ borderBottom: '1px solid var(--surface-border)' }}>
                                <td style={{ padding: '8px 0', fontWeight: 500, color: 'var(--text-secondary)', width: '40%' }}>{key}</td>
                                <td style={{ padding: '8px 0', wordBreak: 'break-all' }}>{String(value)}</td>
                              </tr>
                            ));
                          } catch (err) {
                            return null;
                          }
                        })()}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="data-table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    {(() => {
                      const allKeys = new Set<string>();
                      tableData.forEach(row => {
                        Object.keys(row).forEach(key => {
                          if (typeof row[key] !== 'object' && key !== 'feedId' && key !== 'nodeId' && key !== 'payloadId') {
                            allKeys.add(key);
                          }
                        });
                      });
                      return Array.from(allKeys).map((key) => (
                        <th key={key}>{key.replace(/([A-Z])/g, ' $1').trim()}</th>
                      ));
                    })()}
                  </tr>
                </thead>
                <tbody>
                  {tableData.map((row: any, i: number) => (
                    <tr key={i}>
                      {(() => {
                        const allKeys = new Set<string>();
                        tableData.forEach(row => {
                          Object.keys(row).forEach(key => {
                            if (typeof row[key] !== 'object' && key !== 'feedId' && key !== 'nodeId' && key !== 'payloadId') {
                              allKeys.add(key);
                            }
                          });
                        });
                        return Array.from(allKeys).map((key) => (
                          <td key={key}>
                            {key === 'status' || key === 'complianceStatus' ? (
                              <span className={`badge ${row[key] ? row[key].toLowerCase() : ''}`}>
                                {row[key] || ''}
                              </span>
                            ) : key === 'metadata' && row[key] ? (
                              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', cursor: 'pointer' }} title={row[key]}>
                                &#123; JSON Data &#125;
                              </span>
                            ) : (
                              String(row[key] || '')
                            )}
                          </td>
                        ));
                      })()}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
