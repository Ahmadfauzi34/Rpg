import {Component, inject, output} from '@angular/core';
import {GameStateService} from './game-state.service';
import {MatIconModule} from '@angular/material/icon';

@Component({
  selector: 'app-npc-map',
  standalone: true,
  imports: [MatIconModule],
  template: `
    <div class="fixed inset-0 z-50 flex flex-col bg-zinc-950/95 backdrop-blur-md text-zinc-200 font-sans animation-fade-in">
      <!-- Header -->
      <div class="px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-top))] sm:pb-3 border-b border-zinc-800/80 flex justify-between items-center bg-zinc-900/80 shrink-0 shadow-lg z-20">
        <div class="flex items-center gap-3">
          <div class="relative flex items-center justify-center w-8 h-8 rounded-full bg-amber-500/10 border border-amber-500/30">
            <mat-icon class="text-amber-500 animate-pulse text-[18px] w-[18px] h-[18px]">radar</mat-icon>
          </div>
          <div class="flex flex-col">
            <h2 class="text-[14px] font-bold tracking-widest text-white uppercase font-mono leading-none">NPC Tracing</h2>
            <span class="text-[9px] text-emerald-500 font-mono tracking-widest uppercase mt-1">Live Satellite Link</span>
          </div>
        </div>
        <button (click)="closeMap.emit()" aria-label="Close map" class="p-1.5 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors border border-zinc-700/50 flex items-center justify-center">
          <mat-icon class="text-[20px] w-[20px] h-[20px]">close</mat-icon>
        </button>
      </div>

      <!-- Map Content -->
      <div class="flex-1 relative overflow-hidden bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-zinc-900/50 to-zinc-950">
        <!-- Map Grid Overlay -->
        <div class="absolute inset-0 opacity-[0.04] pointer-events-none" style="background-size: 30px 30px; background-image: linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px);"></div>
        
        <!-- Radar Sweep -->
        <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[150vw] h-[150vw] sm:w-[800px] sm:h-[800px] border border-amber-500/10 rounded-full animate-[spin_8s_linear_infinite] pointer-events-none z-0">
           <div class="w-1/2 h-full bg-gradient-to-r from-transparent to-amber-500/[0.05] rounded-r-full border-r-2 border-amber-500/30"></div>
        </div>

        <div class="relative z-10 w-full h-full overflow-y-auto p-4 space-y-4">
          @if (getNpcs().length === 0) {
            <div class="flex flex-col items-center justify-center h-full text-zinc-600 space-y-3">
              <mat-icon class="text-5xl opacity-20 w-[48px] h-[48px]">radar</mat-icon>
              <p class="font-mono text-[11px] uppercase tracking-widest text-center">No NPC signatures detected.<br>Awaiting encounters.</p>
            </div>
          } @else {
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-2xl mx-auto pb-8">
              @for (npc of getNpcs(); track npc.key) {
                <div class="bg-zinc-900/80 border border-zinc-800 rounded-xl p-3 flex gap-4 relative overflow-hidden shadow-lg backdrop-blur-sm group hover:border-amber-500/30 transition-colors cursor-default">
                  
                  <div class="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-transparent via-amber-500/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>

                  <!-- Moon Icon representing NPC -->
                  <div class="shrink-0 flex flex-col items-center justify-center w-12 h-12 rounded-full bg-zinc-950 border-2 border-zinc-800 shadow-inner relative">
                    <mat-icon [class]="getMoodColor(npc.value.mood) + ' text-[26px] w-[26px] h-[26px] drop-shadow-md relative z-10'">dark_mode</mat-icon>
                    
                    <!-- Ping effect -->
                    <div class="absolute inset-0 rounded-full border border-amber-500/0 group-hover:animate-ping group-hover:border-amber-500/50"></div>
                  </div>
                  
                  <div class="flex-1 min-w-0 flex flex-col justify-center">
                    <div class="flex items-center justify-between">
                      <h3 class="text-[13px] font-bold text-zinc-100 uppercase truncate tracking-tight">{{npc.key}}</h3>
                      <mat-icon class="text-[14px] w-[14px] h-[14px] text-zinc-600">my_location</mat-icon>
                    </div>
                    
                    @if (npc.value.lokasi || npc.value.location || npc.value.aktivitas) {
                      <p class="text-[11px] text-zinc-400 mt-1 leading-tight flex items-start gap-1.5 pb-0.5">
                        <span class="shrink-0 w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse mt-[3px]"></span>
                        <span class="whitespace-normal break-words pr-2">
                          @if (npc.value.lokasi || npc.value.location) { <span class="text-emerald-400 font-mono">[{{npc.value.lokasi || npc.value.location}}]</span> }
                          {{npc.value.aktivitas || ''}}
                        </span>
                      </p>
                    }
                    
                    @if (npc.value.mood) {
                      <div class="mt-1.5 inline-flex items-center gap-1.5 bg-zinc-950 border border-zinc-800 px-2 py-0.5 rounded-md self-start">
                        <span class="text-[8px] text-zinc-500 uppercase tracking-widest font-mono">Mood</span>
                        <span class="w-px h-2.5 bg-zinc-800"></span>
                        <span [class]="getMoodColorText(npc.value.mood) + ' text-[9px] uppercase font-bold tracking-wider truncate'">{{npc.value.mood}}</span>
                      </div>
                    }
                  </div>
                </div>
              }
              
              <!-- Mentok / End of List Indicator -->
              <div class="col-span-full pt-6 pb-2 text-center">
                <p class="text-[10px] font-mono text-zinc-600 uppercase tracking-widest flex items-center justify-center gap-2">
                  <span class="w-8 h-px bg-zinc-800"></span>
                  END OF TRANSMISSION
                  <span class="w-8 h-px bg-zinc-800"></span>
                </p>
              </div>
            </div>
          }
        </div>
      </div>
    </div>
  `,
  styles: [`
    .animation-fade-in {
      animation: fadeIn 0.2s ease-out;
    }
    @keyframes fadeIn {
      from { opacity: 0; backdrop-filter: blur(0px); }
      to { opacity: 1; backdrop-filter: blur(12px); }
    }
  `]
})
export class NpcMapComponent {
  gameState = inject(GameStateService);
  closeMap = output<void>();

  getNpcs() {
    let keys = Object.keys(this.gameState.npcStates);
    if (this.gameState.rollingNpcKeys && this.gameState.rollingNpcKeys.length > 0) {
       keys = keys.filter(k => this.gameState.rollingNpcKeys.includes(k));
    } else {
       keys = keys.slice(0, 3);
    }
    
    return keys.map(key => ({
      key,
      value: this.gameState.npcStates[key]
    }));
  }

  getMoodColor(mood?: string): string {
    if (!mood) return 'text-zinc-500';
    const m = mood.toLowerCase();
    if (m.includes('marah') || m.includes('kesal') || m.includes('hostile')) return 'text-red-500';
    if (m.includes('waspada') || m.includes('curiga')) return 'text-amber-500';
    if (m.includes('sedih') || m.includes('murung')) return 'text-blue-500';
    if (m.includes('senang') || m.includes('ramah') || m.includes('hangat')) return 'text-emerald-500';
    // default
    return 'text-zinc-400';
  }
  
  getMoodColorText(mood?: string): string {
    if (!mood) return 'text-zinc-500';
    const m = mood.toLowerCase();
    if (m.includes('marah') || m.includes('kesal') || m.includes('hostile')) return 'text-red-400';
    if (m.includes('waspada') || m.includes('curiga')) return 'text-amber-400';
    if (m.includes('sedih') || m.includes('murung')) return 'text-blue-400';
    if (m.includes('senang') || m.includes('ramah') || m.includes('hangat')) return 'text-emerald-400';
    // default
    return 'text-zinc-300';
  }
}
