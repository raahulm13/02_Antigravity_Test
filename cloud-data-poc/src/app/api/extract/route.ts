import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const entityType = searchParams.get('type');

    if (!entityType) {
      // Return all high-level stats if no specific entity requested
      const feedsCount = await prisma.feed.count();
      const payloadsCount = await prisma.payload.count();
      const elementsCount = await prisma.dataElement.count();
      const controlsCount = await prisma.control.count();
      
      return NextResponse.json({
        stats: {
          feeds: feedsCount,
          payloads: payloadsCount,
          elements: elementsCount,
          controls: controlsCount
        }
      });
    }

    let data;

    switch (entityType) {
      case 'feeds':
        data = await prisma.feed.findMany({ 
          include: { 
            payloads: true,
            controls: true
          } 
        });
        break;
      case 'payloads':
        data = await prisma.payload.findMany({ include: { dataElements: true, feed: true } });
        break;
      case 'dataElements':
        data = await prisma.dataElement.findMany({ include: { payload: true } });
        break;
      case 'lineage': {
        const nodes = await prisma.lineageNode.findMany({
          include: { controls: true }
        });
        const edges = await prisma.lineageEdge.findMany({
          include: { feed: { include: { controls: true } } }
        });
        data = { nodes, edges };
        break;
      }
      case 'controls':
        data = await prisma.control.findMany({
          include: {
            feed: { select: { feedName: true } },
            node: { select: { nodeName: true } }
          }
        });
        break;
      default:
        return NextResponse.json({ error: `Unknown entityType: ${entityType}` }, { status: 400 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error('Extraction Error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
