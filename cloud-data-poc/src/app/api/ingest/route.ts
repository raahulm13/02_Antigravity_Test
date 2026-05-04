import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';



export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { entityType, data } = body;

    if (!entityType || !data || !Array.isArray(data)) {
      return NextResponse.json({ error: 'Invalid payload. Must include entityType and data array.' }, { status: 400 });
    }

    let result;

    // Depending on what data is being ingested, route to correct Prisma model
    switch (entityType) {
      case 'feeds':
        await prisma.feed.deleteMany({});
        result = await prisma.feed.createMany({
          data: data.map(item => ({
            id: item.id || undefined,
            feedName: item.feedName || `FEED-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            sourceSystem: item.sourceSystem || 'Unknown',
            targetSystem: item.targetSystem || 'Unknown',
            protocol: item.protocol || 'API',
            status: item.status || 'Active',
            lastVerified: new Date(),
          })),

        });
        break;

      case 'payloads':
        await prisma.payload.deleteMany({});
        result = await prisma.payload.createMany({
          data: data.map(item => ({
            id: item.id || undefined,
            payloadName: item.payloadName || 'Unnamed Payload',
            format: item.format || 'JSON',
            feedId: item.feedId,
          })),

        });
        break;

      case 'dataElements':
        await prisma.dataElement.deleteMany({});
        result = await prisma.dataElement.createMany({
          data: data.map(item => ({
            id: item.id || undefined,
            elementName: item.elementName || 'Unknown Element',
            dataType: item.dataType || 'String',
            payloadId: item.payloadId,
          })),

        });
        break;

      case 'lineage': {
        const nodesMap = new Map();
        const edgesSet = new Set<string>();
        
        data.forEach(row => {
          const keys = Object.keys(row);
          const chunkSize = 20;
          let previousNodeName: string | null = null;
          
          for (let i = 0; i < keys.length; i += chunkSize) {
            const chunkKeys = keys.slice(i, i + chunkSize);
            if (chunkKeys.every(k => !row[k])) continue;
            
            const metadataObj: any = {};
            let nodeName: string | null = null;
            
            chunkKeys.forEach(k => {
              const val = row[k];
              if (!val) return;
              
              const lowerK = k.toLowerCase();
              if (!nodeName && (lowerK.includes('name') || lowerK.includes('system') || lowerK.includes('node') || lowerK.includes('src') || lowerK.includes('tgt') || lowerK.includes('source') || lowerK.includes('target'))) {
                nodeName = val;
              } else {
                metadataObj[k] = val;
              }
            });
            
            if (!nodeName && chunkKeys.length > 0) nodeName = row[chunkKeys[0]];
            
            if (nodeName) {
              const nodeStr = String(nodeName);
              nodesMap.set(nodeStr, JSON.stringify(metadataObj));
              
              if (previousNodeName && previousNodeName !== nodeStr) {
                edgesSet.add(`${previousNodeName}::${nodeStr}`);
              }
              previousNodeName = nodeStr;
            }
          }
        });
        
        for (const [nodeName, metadata] of Array.from(nodesMap.entries())) {
          await prisma.lineageNode.upsert({
            where: { nodeName },
            update: { metadata },
            create: { nodeName, metadata }
          });
        }
        
        for (const edgeKey of Array.from(edgesSet)) {
          const [sourceName, targetName] = edgeKey.split('::');
          const existingEdge = await prisma.lineageEdge.findFirst({
            where: { sourceName, targetName }
          });
          
          const feed = await prisma.feed.findFirst({
            where: { sourceSystem: sourceName, targetSystem: targetName }
          });
          
          if (!existingEdge) {
            await prisma.lineageEdge.create({
              data: { sourceName, targetName, feedId: feed?.id || null }
            });
          } else if (feed?.id && existingEdge.feedId !== feed.id) {
            await prisma.lineageEdge.update({
              where: { id: existingEdge.id },
              data: { feedId: feed.id }
            });
          }
        }
        
        result = { count: nodesMap.size + edgesSet.size };
        break;
      }

      case 'controls': {
        // Clear existing controls to allow fresh ingestion without ID conflicts
        await prisma.control.deleteMany({});
        
        const controlRecords = [];
        for (const item of data) {
          let feedId = null;
          let nodeId = null;

          if (item.feedName) {
            const feed = await prisma.feed.findUnique({ where: { feedName: item.feedName } });
            if (feed) feedId = feed.id;
          }

          if (item.nodeName) {
            const node = await prisma.lineageNode.findUnique({ where: { nodeName: item.nodeName } });
            if (node) nodeId = node.id;
          }

          controlRecords.push({
            id: item.id || undefined,
            controlName: item.controlName || 'Unknown Control',
            controlType: item.controlType || 'Security',
            description: item.description || '',
            owner: item.owner || 'Admin',
            sla: item.sla || '24h',
            complianceStatus: item.complianceStatus || 'Pending',
            targetType: item.targetType || 'Feed',
            targetId: item.targetId || '',
            feedId,
            nodeId
          });
        }
        result = await prisma.control.createMany({ data: controlRecords });
        break;
      }

      default:
        return NextResponse.json({ error: `Unknown entityType: ${entityType}` }, { status: 400 });
    }

    return NextResponse.json({ success: true, inserted: result.count });
  } catch (error: any) {
    console.error('Ingestion Error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
