/* eslint-disable @typescript-eslint/no-explicit-any */
import { Component, ElementRef, ViewChild, AfterViewInit, effect, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GameStateService } from './game-state.service';
import * as d3 from 'd3';

@Component({
  selector: 'app-knowledge-graph',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="flex flex-col h-full bg-[#0a0a0a] text-zinc-300 relative border border-zinc-800 rounded-xl overflow-hidden shadow-2xl shadow-fuchsia-900/10">
      
      <!-- Header / Stats -->
      <div class="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-4 bg-gradient-to-b from-[#0a0a0a] to-transparent pointer-events-none">
        <div>
          <h3 class="text-xs tracking-widest uppercase font-bold text-fuchsia-500 mb-1">Neural Memory Graph</h3>
          <p class="text-[10px] text-zinc-500 font-mono">Visualisasi Long-Term Memory & Asosiasi Vektor</p>
        </div>
        <div class="flex gap-4">
          <div class="bg-zinc-900/80 backdrop-blur border border-zinc-800 rounded-lg px-3 py-1.5 flex flex-col items-end pointer-events-auto">
            <span class="text-[9px] text-zinc-500 uppercase tracking-widest font-bold">Nodes</span>
            <span class="text-sm font-mono text-zinc-300">{{ nodeCount }}</span>
          </div>
          <div class="bg-zinc-900/80 backdrop-blur border border-zinc-800 rounded-lg px-3 py-1.5 flex flex-col items-end pointer-events-auto">
            <span class="text-[9px] text-zinc-500 uppercase tracking-widest font-bold">Links</span>
            <span class="text-sm font-mono text-fuchsia-400">{{ linkCount }}</span>
          </div>
        </div>
      </div>

      <!-- D3 Canvas Container -->
      <div #graphContainer class="flex-1 w-full h-full relative overflow-hidden" (window:resize)="onResize()"></div>

      <!-- Info Panel Hook (Bottom) -->
      @if (selectedNode) {
        <div class="absolute bottom-4 left-4 right-4 z-10 bg-zinc-900/90 backdrop-blur-md border border-zinc-700/50 rounded-xl p-4 shadow-xl pointer-events-auto transform transition-all">
          <div class="flex items-start justify-between mb-2">
            <h4 class="text-sm font-bold text-fuchsia-400">{{ selectedNode.id }}</h4>
            <span class="text-[9px] px-2 py-0.5 rounded-full uppercase tracking-wider font-bold"
                  [ngClass]="selectedNode.type === 'entity' ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'">
              {{ selectedNode.type }}
            </span>
          </div>
          
          @if (selectedNode.type === 'entity') {
            <p class="text-[11px] text-zinc-400 mb-2">Daftar memori mengikat:</p>
            <ul class="space-y-1.5 max-h-32 overflow-y-auto custom-scrollbar pr-2">
              @for (fact of getFacts(selectedNode.id); track fact) {
                <li class="flex items-start gap-2 text-[11px]">
                  <span class="text-fuchsia-500 mt-0.5 mt-[2px] opacity-60">■</span>
                  <span class="text-zinc-300 leading-relaxed">{{ fact }}</span>
                </li>
              }
            </ul>
          } @else {
            <p class="text-[11px] text-zinc-300 leading-relaxed">{{ selectedNode.id }}</p>
          }
        </div>
      }
    </div>
  `
})
export class KnowledgeGraphComponent implements AfterViewInit {
  @ViewChild('graphContainer') container!: ElementRef<HTMLDivElement>;
  
  gameState = inject(GameStateService);

  private svg: d3.Selection<SVGSVGElement, unknown, null, undefined> | null = null;
  private simulation: d3.Simulation<d3.SimulationNodeDatum, undefined> | null = null;

  nodeCount = 0;
  linkCount = 0;
  selectedNode: any = null;

  private width = 600;
  private height = 400;

  constructor() {
    effect(() => {
      const kg = this.gameState.knowledgeGraph;
      if (this.svg) {
        this.renderGraph(kg);
      }
    });
  }

  ngAfterViewInit() {
    this.initGraph();
    this.renderGraph(this.gameState.knowledgeGraph || {});
  }

  onResize() {
    if (!this.container) return;
    this.width = this.container.nativeElement.clientWidth;
    this.height = this.container.nativeElement.clientHeight;
    if (this.svg) {
      this.svg.attr('width', this.width).attr('height', this.height);
      if (this.simulation) {
        this.simulation.force('center', d3.forceCenter(this.width / 2, this.height / 2));
        this.simulation.alpha(0.3).restart();
      }
    }
  }

  getFacts(entityId: string): string[] {
     const kg = this.gameState.knowledgeGraph || {};
     return kg[entityId] || [];
  }

  private initGraph() {
    this.width = this.container.nativeElement.clientWidth || 600;
    this.height = this.container.nativeElement.clientHeight || 400;

    this.svg = d3.select(this.container.nativeElement)
      .append('svg')
      .attr('width', this.width)
      .attr('height', this.height)
      .call(d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.1, 4])
        .on('zoom', (event) => {
          if (this.svg) {
            this.svg.select('g').attr('transform', event.transform);
          }
        })
      )
      .on('click', () => {
        this.selectedNode = null;
        this.highlightNodes(null);
      });

    this.svg.append('g');
  }

  private renderGraph(kg: Record<string, string[]>) {
    if (!this.svg) return;

    const nodes: any[] = [];
    const links: any[] = [];
    const entitySet = new Set<string>();

    nodes.push({ id: 'MC', type: 'core', group: 0, radius: 20 });
    entitySet.add('MC');

    for (const [entity, facts] of Object.entries(kg)) {
      if (!entitySet.has(entity)) {
        nodes.push({ id: entity, type: 'entity', group: 1, radius: 15 });
        entitySet.add(entity);
      }
      
      links.push({ source: 'MC', target: entity, value: 3, type: 'observes' });

      for (const fact of facts) {
        const factId = fact.substring(0, 40) + (fact.length > 40 ? '...' : '');
        if (!entitySet.has(factId)) {
          nodes.push({ id: factId, fullText: fact, type: 'fact', group: 2, radius: 8 });
          entitySet.add(factId);
        }
        links.push({ source: entity, target: factId, value: 1, type: 'binds' });
      }
    }

    this.nodeCount = nodes.length;
    this.linkCount = links.length;

    const g = this.svg.select('g');
    g.selectAll('*').remove();

    this.simulation = d3.forceSimulation(nodes as d3.SimulationNodeDatum[])
      .force('link', d3.forceLink(links).id((d: any) => d.id).distance((d: any) => d.type === 'observes' ? 120 : 60))
      .force('charge', d3.forceManyBody().strength(-200))
      .force('center', d3.forceCenter(this.width / 2, this.height / 2))
      .force('collide', d3.forceCollide().radius((d: any) => d.radius + 10).iterations(2));

    const link = g.append('g')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke-width', (d: any) => Math.sqrt(d.value))
      .attr('stroke', (d: any) => d.type === 'observes' ? '#4c1d95' : '#3f3f46')
      .attr('stroke-opacity', 0.6);

    const node = g.append('g')
      .selectAll('g')
      .data(nodes)
      .join('g')
      .attr('class', 'node-group cursor-pointer')
      .call(this.drag(this.simulation) as any)
      .on('click', (event, d) => {
        event.stopPropagation();
        this.selectedNode = d;
        this.highlightNodes(d.id);
      });

    node.append('circle')
      .attr('r', (d: any) => d.radius)
      .attr('fill', (d: any) => {
        if (d.type === 'core') return '#d946ef';
        if (d.type === 'entity') return '#6366f1';
        return '#10b981';
      })
      .attr('fill-opacity', (d: any) => d.type === 'fact' ? 0.3 : 1)
      .attr('stroke', (d: any) => {
        if (d.type === 'core') return '#fdf4ff'; 
        if (d.type === 'entity') return '#e0e7ff';
        return '#a7f3d0';
      })
      .attr('stroke-width', (d: any) => d.type === 'fact' ? 1 : 2);

    node.append('text')
      .text((d: any) => d.type === 'fact' ? '' : d.id)
      .attr('x', (d: any) => d.radius + 6)
      .attr('y', 4)
      .attr('font-size', '10px')
      .attr('fill', '#a1a1aa')
      .attr('font-family', 'ui-monospace, monospace')
      .style('pointer-events', 'none')
      .style('text-shadow', '0 2px 4px rgba(0,0,0,0.8)');

    this.simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y);

      node
        .attr('transform', (d: any) => 'translate(' + d.x + ',' + d.y + ')');
    });
  }

  private drag(simulation: any) {
    return d3.drag()
      .on('start', (event) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        event.subject.fx = event.subject.x;
        event.subject.fy = event.subject.y;
      })
      .on('drag', (event) => {
        event.subject.fx = event.x;
        event.subject.fy = event.y;
      })
      .on('end', (event) => {
        if (!event.active) simulation.alphaTarget(0);
        event.subject.fx = null;
        event.subject.fy = null;
      });
  }

  private highlightNodes(focusId: string | null) {
    if (!this.svg) return;
    const g = this.svg.select('g');
    
    if (!focusId) {
      g.selectAll('circle').attr('opacity', 1);
      g.selectAll('line').attr('opacity', 0.6);
      g.selectAll('text').attr('opacity', 1);
      return;
    }

    g.selectAll('circle').attr('opacity', (d: any) => d.id === focusId ? 1 : 0.3);
    g.selectAll('line').attr('opacity', (d: any) => d.source.id === focusId || d.target.id === focusId ? 0.8 : 0.1);
    g.selectAll('text').attr('opacity', (d: any) => d.id === focusId ? 1 : 0.3);
  }
}
