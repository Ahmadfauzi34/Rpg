import {Component, inject} from '@angular/core';
import {GameStateService} from './game-state.service';
import {MatIconModule} from '@angular/material/icon';
import {JsonPipe, NgClass, NgStyle} from '@angular/common';

@Component({
  selector: 'app-character',
  standalone: true,
  imports: [MatIconModule, JsonPipe, NgClass, NgStyle],
  template: `
    <div class="bg-zinc-950 min-h-full font-sans flex flex-col relative">
      
      <!-- Character Header Background -->
      <div class="h-24 bg-gradient-to-b from-emerald-900/30 to-zinc-950 absolute top-0 left-0 right-0 pointer-events-none"></div>

      <div class="p-4 flex-1 overflow-y-auto space-y-5 custom-scrollbar relative z-10">
        <!-- Header Profile -->
        <div class="flex items-center gap-4">
          <div class="w-16 h-16 bg-zinc-900 border-2 border-emerald-500 rounded-full flex items-center justify-center relative shadow-[0_0_15px_rgba(16,185,129,0.3)] shrink-0">
            <mat-icon class="text-[32px] w-[32px] h-[32px] text-zinc-400">person</mat-icon>
            <div class="absolute -bottom-1 -right-1 bg-emerald-500 w-4 h-4 rounded-full border-2 border-zinc-950 flex items-center justify-center">
              <mat-icon class="text-[10px] w-[10px] h-[10px] text-zinc-950 font-bold">bolt</mat-icon>
            </div>
          </div>
          <div>
            <h2 class="text-xl font-bold tracking-tight text-white mb-0.5 uppercase leading-none">Kuro</h2>
            <div class="flex items-center gap-2">
              <span class="text-[10px] px-1.5 py-0.5 rounded-sm bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-mono tracking-widest uppercase">Pengembara</span>
              <span class="text-[10px] font-mono text-zinc-500">Lv. ??</span>
            </div>
          </div>
        </div>
        
        <!-- Status Grid -->
        <div class="grid grid-cols-2 gap-2">
          <div class="bg-zinc-900/80 border border-zinc-800 rounded-lg p-2.5 flex flex-col gap-0.5">
            <span class="text-[9px] uppercase tracking-wider text-zinc-500 font-bold flex items-center gap-1">
              <mat-icon class="text-[10px] w-[10px] h-[10px]">location_on</mat-icon> Location
            </span>
            <span class="text-[12px] text-zinc-200 font-medium leading-neutral truncate">{{gameState.mcState.locationName || 'Unknown'}}</span>
          </div>
          <div class="bg-zinc-900/80 border border-zinc-800 rounded-lg p-2.5 flex flex-col gap-0.5">
            <span class="text-[9px] uppercase tracking-wider text-zinc-500 font-bold flex items-center gap-1">
              <mat-icon class="text-[10px] w-[10px] h-[10px]">schedule</mat-icon> Time / Day
            </span>
            <span class="text-[11px] text-zinc-200 font-medium font-mono leading-tight">{{gameState.mcState.time || '--:--'}} | Day {{gameState.mcState.day || '-'}}</span>
          </div>
          <div class="bg-zinc-900/80 border border-emerald-900/30 rounded-lg p-2.5 flex items-center justify-between col-span-2">
            <div class="flex flex-col gap-0.5">
               <span class="text-[9px] uppercase tracking-wider text-zinc-500 font-bold">Status</span>
               <span class="text-[13px] text-emerald-400 font-medium leading-tight flex items-center gap-1.5">
                 <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                 {{gameState.mcState.status || 'Healthy'}}
               </span>
            </div>
            <!-- Health / SP representation -> static for now as we don't have exact HP -->
            <div class="text-right">
              <div class="text-[10px] font-mono text-emerald-500 font-bold">HP: 100/100</div>
              <div class="text-[10px] font-mono text-blue-500 font-bold">SP: 50/50</div>
            </div>
          </div>
        </div>

        <!-- Custom Tabs -->
        <div class="flex items-center gap-1 bg-zinc-900 rounded-lg p-1">
          <button (click)="activeTab = 'stats'" [ngClass]="activeTab === 'stats' ? 'bg-zinc-800 text-zinc-200 shadow-sm' : 'text-zinc-500 hover:text-zinc-300'" class="flex-1 py-1.5 text-[11px] uppercase tracking-wider font-bold rounded-md transition-all">
            Stats
          </button>
          <button (click)="activeTab = 'inventory'" [ngClass]="activeTab === 'inventory' ? 'bg-zinc-800 text-zinc-200 shadow-sm' : 'text-zinc-500 hover:text-zinc-300'" class="flex-1 py-1.5 text-[11px] uppercase tracking-wider font-bold rounded-md transition-all">
            Inventory
          </button>
        </div>

        @if (activeTab === 'stats') {
          <div class="space-y-3 pb-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div class="space-y-4 bg-zinc-900/50 p-4 rounded-xl border border-zinc-800/50">
              <!-- Strength -->
              <div>
                <div class="flex justify-between items-center mb-1.5">
                  <span class="text-[10px] font-medium text-zinc-300 uppercase tracking-widest flex items-center gap-1">
                     <mat-icon class="text-[12px] w-[12px] h-[12px] text-emerald-500">fitness_center</mat-icon>
                     Strength
                  </span>
                  <span class="text-[11px] font-mono text-emerald-400 font-bold">{{ getStatLabel(gameState.mcState.stats?.['strength'] || '0') }}</span>
                </div>
                <div class="w-full bg-zinc-950 h-2 rounded-full overflow-hidden border border-zinc-800">
                  <div class="bg-gradient-to-r from-emerald-600 to-emerald-400 h-full shadow-[0_0_8px_rgba(16,185,129,0.5)] transition-all duration-500" [ngStyle]="{'width': getStatWidth(gameState.mcState.stats?.['strength'])}"></div>
                </div>
              </div>
              <!-- Charisma -->
              <div>
                <div class="flex justify-between items-center mb-1.5">
                  <span class="text-[10px] font-medium text-zinc-300 uppercase tracking-widest flex items-center gap-1">
                     <mat-icon class="text-[12px] w-[12px] h-[12px] text-blue-500">record_voice_over</mat-icon>
                     Charisma
                  </span>
                  <span class="text-[11px] font-mono text-blue-400 font-bold">{{ getStatLabel(gameState.mcState.stats?.['charisma'] || '0') }}</span>
                </div>
                <div class="w-full bg-zinc-950 h-2 rounded-full overflow-hidden border border-zinc-800">
                  <div class="bg-gradient-to-r from-blue-600 to-blue-400 h-full transition-all duration-500" [ngStyle]="{'width': getStatWidth(gameState.mcState.stats?.['charisma'])}"></div>
                </div>
              </div>
              <!-- Stamina -->
              <div>
                <div class="flex justify-between items-center mb-1.5">
                  <span class="text-[10px] font-medium text-zinc-300 uppercase tracking-widest flex items-center gap-1">
                     <mat-icon class="text-[12px] w-[12px] h-[12px] text-amber-500">directions_run</mat-icon>
                     Stamina
                  </span>
                  <span class="text-[11px] font-mono text-amber-400 font-bold">{{ getStatLabel(gameState.mcState.stats?.['stamina'] || '0') }}</span>
                </div>
                <div class="w-full bg-zinc-950 h-2 rounded-full overflow-hidden border border-zinc-800">
                  <div class="bg-gradient-to-r from-amber-600 to-amber-400 h-full transition-all duration-500" [ngStyle]="{'width': getStatWidth(gameState.mcState.stats?.['stamina'])}"></div>
                </div>
              </div>
              <!-- Agility -->
              <div>
                <div class="flex justify-between items-center mb-1.5">
                  <span class="text-[10px] font-medium text-zinc-300 uppercase tracking-widest flex items-center gap-1">
                     <mat-icon class="text-[12px] w-[12px] h-[12px] text-purple-500">flash_on</mat-icon>
                     Agility
                  </span>
                  <span class="text-[11px] font-mono text-purple-400 font-bold">{{ getStatLabel(gameState.mcState.stats?.['agility'] || '0') }}</span>
                </div>
                <div class="w-full bg-zinc-950 h-2 rounded-full overflow-hidden border border-zinc-800">
                  <div class="bg-gradient-to-r from-purple-600 to-purple-400 h-full transition-all duration-500" [ngStyle]="{'width': getStatWidth(gameState.mcState.stats?.['agility'])}"></div>
                </div>
              </div>
            </div>
            
            @if(gameState.mcState.trust) {
              <div class="pt-2">
                <h3 class="text-[10px] uppercase tracking-widest font-bold text-zinc-500 pb-2">Trust Levels / Alignments</h3>
                <pre class="bg-zinc-900 border border-zinc-800 p-3 rounded-lg text-[11px] font-mono text-amber-500 shadow-inner overflow-x-auto custom-scrollbar">{{gameState.mcState.trust | json}}</pre>
              </div>
            }
          </div>
        } @else {
          <div class="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300 pb-8">
            <!-- Equipment Slots Placeholder -->
            <div class="grid grid-cols-4 gap-2">
              <div class="bg-zinc-900/50 border border-zinc-800 rounded-lg aspect-square flex flex-col items-center justify-center gap-1 hover:border-zinc-700 transition-colors shadow-inner">
                <mat-icon class="text-zinc-600 text-[18px]">hardware</mat-icon>
                <span class="text-[8px] uppercase tracking-widest text-zinc-500 font-bold">Wpn</span>
              </div>
              <div class="bg-zinc-900/50 border border-zinc-800 rounded-lg aspect-square flex flex-col items-center justify-center gap-1 hover:border-zinc-700 transition-colors shadow-inner">
                <mat-icon class="text-zinc-600 text-[18px]">checkroom</mat-icon>
                <span class="text-[8px] uppercase tracking-widest text-zinc-500 font-bold">Amr</span>
              </div>
              <div class="bg-zinc-900/50 border border-zinc-800 rounded-lg aspect-square flex flex-col items-center justify-center gap-1 hover:border-zinc-700 transition-colors shadow-inner">
                 <mat-icon class="text-zinc-600 text-[18px]">watch</mat-icon>
                 <span class="text-[8px] uppercase tracking-widest text-zinc-500 font-bold">Acc.</span>
              </div>
              <div class="bg-zinc-900/50 border border-zinc-800 rounded-lg aspect-square flex flex-col items-center justify-center gap-1 hover:border-zinc-700 transition-colors shadow-inner">
                 <mat-icon class="text-zinc-600 text-[18px]">backpack</mat-icon>
                 <span class="text-[8px] uppercase tracking-widest text-zinc-500 font-bold">Bag</span>
              </div>
            </div>

            <div class="space-y-2">
               <h3 class="text-[10px] uppercase tracking-widest font-bold text-zinc-500 flex items-center justify-between">
                 <span>Items</span>
                 <span class="text-zinc-600 text-[9px]">{{ gameState.mcState.inventory?.length || 0 }} / 20</span>
               </h3>
               @if (gameState.mcState.inventory && gameState.mcState.inventory.length > 0) {
                 <ul class="space-y-2">
                   @for (item of gameState.mcState.inventory; track $index) {
                     <li class="bg-zinc-900 border border-zinc-800 p-2 rounded-lg flex items-start gap-3 hover:bg-zinc-800/80 transition-colors group">
                       <div class="w-8 h-8 rounded bg-zinc-950 border border-zinc-800 flex items-center justify-center shrink-0 shadow-inner">
                         <mat-icon class="text-zinc-500 text-[16px] w-[16px] h-[16px] group-hover:text-emerald-400 transition-colors">category</mat-icon>
                       </div>
                       <div class="py-1">
                         <span class="text-[12px] text-zinc-300 font-bold leading-none block">{{item}}</span>
                       </div>
                     </li>
                   }
                 </ul>
               } @else {
                  <div class="p-6 border border-zinc-800 border-dashed rounded-xl flex flex-col items-center justify-center text-center text-zinc-600 bg-zinc-900/30">
                     <mat-icon class="mb-2 opacity-50">inventory_2</mat-icon>
                     <p class="text-[11px]">Tidak ada item di inventory.</p>
                  </div>
               }
            </div>
          </div>
        }
      </div>
    </div>
  `
})
export class CharacterComponent {
  gameState = inject(GameStateService);
  activeTab: 'stats' | 'inventory' = 'stats';

  getStatLabel(val: number | string): string {
    if (typeof val === 'string' && val.toLowerCase() === 'max') return 'MAX';
    return `${val}%`;
  }

  getStatWidth(val: number | string | undefined): string {
    if (!val) return '0%';
    if (typeof val === 'string' && val.toLowerCase() === 'max') return '100%';
    const num = Number(val);
    if (isNaN(num)) return '0%';
    return `${Math.min(100, Math.max(0, num))}%`;
  }
}
