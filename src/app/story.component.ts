import {Component, inject, ViewChild, ElementRef, AfterViewChecked} from '@angular/core';
import {ReactiveFormsModule, FormControl} from '@angular/forms';
import {EngineService} from './engine.service';
import {GameStateService} from './game-state.service';
import {MatIconModule} from '@angular/material/icon';

@Component({
  selector: 'app-story',
  standalone: true,
  imports: [ReactiveFormsModule, MatIconModule],
  template: `
    <div class="flex flex-col h-full bg-zinc-950">
      
      <!-- Narrative Stream -->
      <div #scrollContainer class="flex-1 overflow-y-auto p-3 space-y-4 scroll-smooth">
        @if (gameState.chronicle.length === 0) {
          <div class="flex flex-col items-center justify-center h-full text-zinc-600 font-mono text-[13px] space-y-4">
            <mat-icon class="text-3xl w-8 h-8 opacity-50">all_inclusive</mat-icon>
            <p class="uppercase tracking-widest text-center">World generated.<br>Awaiting initial conditions.</p>
            <button 
              (click)="startSimulation()"
              [disabled]="engine.isProcessing()"
              class="mt-4 px-5 py-2 bg-emerald-500/[0.15] text-emerald-400 border border-emerald-500/30 rounded-full font-mono text-[11px] font-bold uppercase tracking-widest hover:bg-emerald-500/20 disabled:opacity-50 transition-colors">
              Initialize Scenario
            </button>
          </div>
        }
        
        @for (entry of gameState.chronicle; track $index) {
          <div class="bg-zinc-900 border border-zinc-800 rounded-xl p-4 shadow-sm relative overflow-hidden">
            <div class="absolute top-0 right-0 p-2 opacity-5 pointer-events-none">
              <mat-icon class="text-5xl w-12 h-12">auto_stories</mat-icon>
            </div>
            
            <!-- Rendering Narrative Blocks if available -->
            @if (entry.narrative_blocks && entry.narrative_blocks.length > 0) {
              <div class="space-y-4 mb-3 z-10 relative">
                @for (block of entry.narrative_blocks; track $index) {
                  <div class="border-b border-zinc-800/50 pb-3 last:border-0 last:pb-0">
                    <div class="flex items-center gap-1.5 mb-2">
                       <div class="bg-zinc-800/80 px-2 py-0.5 rounded text-[10px] uppercase tracking-widest font-bold text-emerald-400">
                         {{ block.name }}
                       </div>
                    </div>
                    <div class="space-y-2.5 pl-1 border-l sm:border-l-2 border-emerald-900/30">
                      @if (block.narration) {
                        <p class="font-serif text-[15px] leading-relaxed text-zinc-300">{{ block.narration }}</p>
                      }
                      @if (block.action) {
                        <p class="text-[13px] leading-relaxed font-sans text-emerald-100/70">
                          <span class="font-bold text-emerald-400/80 uppercase tracking-widest text-[9px] mr-1.5">Action</span> 
                          {{ block.action }}
                        </p>
                      }
                      @if (block.dialogue) {
                        <p class="text-[14px] leading-relaxed font-serif text-zinc-300">
                          <span class="font-bold text-amber-500/80 uppercase tracking-widest text-[9px] mr-1.5 font-sans">Dialogue</span> 
                          "<span class="italic">{{ block.dialogue }}</span>"
                        </p>
                      }
                    </div>
                  </div>
                  <!-- separator -->
                  @if (!$last) {
                    <div class="flex justify-center py-2">
                      <span class="text-zinc-800 text-xs">◆ ◆ ◆</span>
                    </div>
                  }
                }
              </div>
            } @else {
              <div class="font-serif text-[15px] leading-relaxed text-zinc-200 z-10 relative mb-3">
                {{entry.narrative}}
              </div>
            }
            
            @if (entry.mc_state && !(entry.narrative_blocks && entry.narrative_blocks.length > 0)) {
              <div class="mt-3 space-y-2.5 border-t border-zinc-800 pt-3">
                @if (entry.mc_state.action) {
                  <p class="text-[13px] leading-relaxed font-sans text-emerald-100/70"><span class="font-bold text-emerald-400/80 uppercase tracking-widest text-[9px] mr-1.5">Action</span> {{entry.mc_state.action}}</p>
                }
                @if (entry.mc_state.dialogue) {
                  <p class="text-[14px] leading-relaxed font-serif text-zinc-300"><span class="font-bold text-amber-500/80 uppercase tracking-widest text-[9px] mr-1.5 font-sans">Dialogue</span> "<span class="italic">{{entry.mc_state.dialogue}}</span>"</p>
                }
              </div>
            }
            
            @if(entry.npc_state && entry.npc_state.length > 0) {
              <div class="mt-4 border-t border-zinc-800/80 pt-3 z-10 relative">
                <p class="text-[10px] uppercase font-bold tracking-wider text-zinc-500 mb-2 flex items-center gap-1">
                  <mat-icon class="text-[12px] w-[12px] h-[12px]">radar</mat-icon> CHARACTERS IN SCENE
                </p>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  @for (npc of entry.npc_state; track npc.nama) {
                    <div class="bg-zinc-950/80 border border-zinc-800/80 rounded block px-2.5 py-2">
                      <div class="flex items-center gap-1.5 mb-1.5">
                        <mat-icon class="text-zinc-500 text-[14px] w-[14px] h-[14px]">person</mat-icon>
                        <p class="text-[10px] font-bold text-zinc-300 uppercase leading-none tracking-wide">{{npc.nama}}</p>
                        @if (npc.mood) {
                          <span class="text-[8px] uppercase tracking-wider text-amber-500 bg-amber-500/10 px-1 py-0.5 rounded ml-auto">{{npc.mood}}</span>
                        }
                      </div>
                      <div class="space-y-1.5 pl-1.5 border-l-2 border-zinc-800/50">
                        @if (npc.lokasi || npc.location) {
                          <div class="flex flex-col gap-0.5">
                            <span class="text-[8px] font-bold uppercase tracking-widest text-emerald-500/70">Location</span>
                            <span class="text-[11.5px] leading-snug font-serif text-zinc-400">{{npc.lokasi || npc.location}}</span>
                          </div>
                        }
                        @if (npc.aktivitas || npc.activity) {
                          <div class="flex flex-col gap-0.5">
                            <span class="text-[8px] font-bold uppercase tracking-widest text-blue-400/70">Activity</span>
                            <span class="text-[11.5px] leading-snug font-serif text-zinc-400 italic">{{npc.aktivitas || npc.activity}}</span>
                          </div>
                        }
                      </div>
                    </div>
                  }
                </div>
              </div>
            }
          </div>
        }
        
        @if (engine.isProcessing()) {
           <div class="flex items-center gap-2 p-3 bg-zinc-900 border border-zinc-800 rounded-lg animate-pulse shadow-sm">
             <mat-icon class="animate-spin text-emerald-500 text-sm w-[16px] h-[16px]">memory</mat-icon>
             <span class="font-mono text-[10px] uppercase tracking-widest text-emerald-500">Guardian Engine Processing...</span>
           </div>
        }
      </div>

      <!-- Action Area -->
      <div class="p-3 bg-zinc-900 border-t border-zinc-800 shrink-0 pb-[env(safe-area-inset-bottom)]">
        @if (gameState.chronicle.length > 0) {
          @if (getLastChoices().length > 0) {
            <div class="flex flex-col gap-2 mb-3">
              @for (choice of getLastChoices(); track $index) {
                <button 
                  class="bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-zinc-500 text-zinc-300 text-[12px] leading-tight font-medium py-2 px-2.5 rounded-md text-left transition-colors flex items-start gap-2 disabled:opacity-50"
                  [disabled]="engine.isProcessing()"
                  (click)="submitChoice(choice.text)">
                    <mat-icon class="text-zinc-500 mt-[1px] text-[14px] w-[14px] h-[14px] shrink-0">radio_button_unchecked</mat-icon>
                    <span>{{choice.text}}</span>
                </button>
              }
            </div>
          }
          
          <div class="flex gap-2">
            <input 
              [formControl]="customAction"
              (keydown.enter)="submitCustomAction()"
              [disabled]="engine.isProcessing()"
              type="text" 
              placeholder="What will you do?"
              class="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2.5 text-[16px] text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 disabled:opacity-50 font-sans"
            >
            <button 
              [disabled]="!customAction.value?.trim() || engine.isProcessing()"
              (click)="submitCustomAction()"
              aria-label="Submit action"
              class="bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white px-3.5 py-2 rounded-lg transition-colors flex items-center justify-center">
              <mat-icon class="text-[20px] w-[20px] h-[20px]">send</mat-icon>
            </button>
          </div>
        }
      </div>
    </div>
  `
})
export class StoryComponent implements AfterViewChecked {
  gameState = inject(GameStateService);
  engine = inject(EngineService);
  customAction = new FormControl('');
  @ViewChild('scrollContainer') scrollContainer!: ElementRef;

  ngAfterViewChecked() {
    this.scrollToBottom();
  }

  scrollToBottom(): void {
    try {
      this.scrollContainer.nativeElement.scrollTop = this.scrollContainer.nativeElement.scrollHeight;
    } catch {
      // ignore
    }
  }

  getLastChoices() {
    if (this.gameState.chronicle.length === 0) return [];
    const lastEntry = this.gameState.chronicle[this.gameState.chronicle.length - 1];
    return lastEntry.choices || [];
  }

  submitChoice(text: string) {
    this.engine.processTurn(text);
  }

  submitCustomAction() {
    const val = this.customAction.value;
    if (val && val.trim()) {
      this.engine.processTurn(val.trim());
      this.customAction.setValue('');
    }
  }

  startSimulation() {
    this.engine.processTurn("Tiba di Yamato Village. Aku terbangun di penginapan Kuda Kering, melihat sekeliling.");
  }
}
