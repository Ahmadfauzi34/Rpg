import {Component, inject, ViewChild, ElementRef, AfterViewChecked} from '@angular/core';
import {GameStateService} from './game-state.service';
import {MatIconModule} from '@angular/material/icon';

@Component({
  selector: 'app-engine-log',
  standalone: true,
  imports: [MatIconModule],
  template: `
    <div class="h-full bg-zinc-950 text-emerald-500 font-mono flex flex-col relative overflow-hidden">
      <!-- CRT overlay effect -->
      <div class="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.1)_50%),linear-gradient(90deg,rgba(255,0,0,0.03),rgba(0,255,0,0.01),rgba(0,0,255,0.03))] bg-[length:100%_4px,3px_100%] z-10 opacity-20"></div>
      
      <div class="p-2 border-b border-zinc-800 flex items-center justify-between bg-zinc-900 shrink-0 z-20 relative shadow-sm">
        <div class="flex items-center gap-2">
           <mat-icon class="text-[14px] w-[14px] h-[14px] text-emerald-500 animate-pulse">terminal</mat-icon>
           <span class="tracking-widest uppercase text-[9px] font-bold text-zinc-300">Guardian Engine Diagnostics</span>
        </div>
        <div class="flex gap-2 items-center">
           <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]"></span>
           <span class="text-[8px] text-emerald-600">SYS_ONLINE</span>
        </div>
      </div>
      
      <div #scrollContainer class="flex-1 overflow-y-auto p-3 space-y-1 z-20 custom-scrollbar relative">
        @for (log of gameState.logs; track $index) {
          <div class="group flex gap-2 text-[10px] sm:text-[11px] leading-relaxed hover:bg-emerald-900/10 p-1 rounded-sm transition-colors border-l-2 border-transparent hover:border-emerald-500">
            <span class="text-zinc-600 shrink-0 select-none">[{{ ($index + 1).toString().padStart(4, '0') }}]</span>
            <span class="text-zinc-500 shrink-0 select-none">></span>
            <span class="whitespace-pre-wrap text-emerald-400 group-hover:text-emerald-300 transition-colors" [innerHTML]="formatLog(log)"></span>
          </div>
        }
        @if (gameState.logs.length === 0) {
          <div class="text-emerald-900/50 italic text-[11px] flex items-center gap-2">
             <mat-icon class="text-[14px] w-[14px] h-[14px] animate-spin">data_usage</mat-icon>
             Awaiting engine telemetry...
          </div>
        }
      </div>
    </div>
  `
})
export class EngineLogComponent implements AfterViewChecked {
  gameState = inject(GameStateService);
  @ViewChild('scrollContainer') private scrollContainer!: ElementRef;

  private prevLogCount = 0;

  ngAfterViewChecked() {
    this.scrollToBottom();
  }

  private scrollToBottom(): void {
    try {
      if (this.scrollContainer && this.gameState.logs.length !== this.prevLogCount) {
        this.scrollContainer.nativeElement.scrollTop = this.scrollContainer.nativeElement.scrollHeight;
        this.prevLogCount = this.gameState.logs.length;
      }
    } catch { /* ignore */ }
  }

  formatLog(log: string): string {
    // Highlight system tags like [Chronos] or [Retrieval] or labels
    return log.replace(/(\[.*?\])/g, '<span class="text-indigo-400 font-bold">$1</span>')
              .replace(/(Error|Memori Ditolak|Gagal)/ig, '<span class="text-red-500 font-bold">$1</span>');
  }
}
