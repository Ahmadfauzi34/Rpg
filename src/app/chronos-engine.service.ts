import { Injectable, inject } from '@angular/core';
import { GameStateService } from './game-state.service';
import { SYSTEM_RULES } from './system-rules';

@Injectable({
  providedIn: 'root'
})
export class ChronosEngineService {
  gameState = inject(GameStateService);

  // Time format: "HH:MM"
  private parseTime(timeStr: string): number {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
  }

  private formatTime(minutes: number): string {
    const h = Math.floor(minutes / 60) % 24;
    const m = minutes % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  }

  // Advance time by N minutes (e.g., typical action takes 15 mins, travel takes 60 mins)
  advanceTime(minutes: number) {
    if (!this.gameState.mcState.time) return;

    const currentMins = this.parseTime(this.gameState.mcState.time);
    let nextMins = currentMins + minutes;
    
    // Day rollover
    if (nextMins >= 24 * 60) {
      if (this.gameState.mcState.day) {
        this.gameState.mcState.day += 1;
      }
      nextMins = nextMins % (24 * 60);
    }

    this.gameState.mcState.time = this.formatTime(nextMins);
    this.gameState.logs.push(`[Chronos] Waktu berlalu. Sekarang jam ${this.gameState.mcState.time}`);

    this.simulateWorldEvents();
  }

  // Simulate background activities of NPCs based on their schedules
  private simulateWorldEvents() {
    if (!this.gameState.mcState.time) return;
    const currentMins = this.parseTime(this.gameState.mcState.time);

    const auralisSchedules = SYSTEM_RULES.modules.npc_daily_schedules_v2.karakter_auralis;
    const yamatoSchedules = SYSTEM_RULES.modules.npc_daily_schedules_v2.karakter_yamato;

    const allSchedules = { ...auralisSchedules, ...yamatoSchedules };

    // Process each NPC
    for (const [npcId, scheduleList] of Object.entries(allSchedules)) {
        // Find the most recent schedule entry that is <= current time
        // Sort schedule by time to be safe (ascending)
        const sortedSchedule = [...scheduleList].sort((a, b) => this.parseTime(a.time) - this.parseTime(b.time));
        
        let currentActivity = null;
        let highestTime = -1;

        for (const entry of sortedSchedule) {
           const entryMins = this.parseTime(entry.time);
           if (entryMins <= currentMins && entryMins > highestTime) {
              highestTime = entryMins;
              currentActivity = entry.activity;
              // Support for location tracking if we updated our schedules
              const entryWithLocation = entry as { time: string; activity: string; lokasi?: string };
              if (entryWithLocation.lokasi) {
                currentActivity += ` (di ${entryWithLocation.lokasi})`;
              }
           }
        }

        // If current time is BEFORE the very first schedule of the day, 
        // we assume they are wrapping over from the previous night or sleeping.
        if (!currentActivity && sortedSchedule.length > 0) {
           const lastEntry = sortedSchedule[sortedSchedule.length - 1];
           currentActivity = lastEntry.activity;
           const lastEntryWithLocation = lastEntry as { time: string; activity: string; lokasi?: string };
           if (lastEntryWithLocation.lokasi) currentActivity += ` (di ${lastEntryWithLocation.lokasi})`;
        } else if (!currentActivity) {
           currentActivity = 'Sedang istirahat / Sibuk';
        }

        if (currentActivity) {
            // Check if NPC is in states, if not, create generic template
            if (!this.gameState.npcStates[npcId]) {
                const dbEntryAuralis = SYSTEM_RULES.character_database.non_player_characters.kerajaan_auralis.find(n => n.nama_lengkap?.includes(npcId.replace('_', ' ')) || n.id.includes(npcId.toUpperCase()));
                const dbEntryYamato = SYSTEM_RULES.character_database.non_player_characters.desa_yamato.find(n => n.nama?.includes(npcId) || n.id.includes(npcId.toUpperCase()));
                const dbe = (dbEntryAuralis || dbEntryYamato) as { nama_lengkap?: string; nama?: string } | undefined;
                
                this.gameState.npcStates[npcId] = {
                    nama: dbe?.nama_lengkap || dbe?.nama || npcId.replace('_', ' '),
                    aktivitas: currentActivity,
                    mood: 'Netral',
                    lokasi: dbe ? (dbEntryAuralis ? 'Auralis' : 'Desa Yamato') : 'Unknown',
                    _lastScheduleTime: highestTime
                };
            } else {
                const existingState = this.gameState.npcStates[npcId];
                // Only override if the schedule block actually transitioned to a new block
                // OR if it's the first time we assign the schedule block tracker
                const isNewScheduleBlock = existingState._lastScheduleTime !== highestTime;
                
                if (isNewScheduleBlock) {
                    existingState.aktivitas = currentActivity;
                    existingState._lastScheduleTime = highestTime;
                    this.gameState.logs.push(`[World Event] ${npcId.replace('_', ' ')} mulai melakukan: ${currentActivity}.`);
                } else {
                    // Update text so it doesn't feel static
                    let elapsedMins = currentMins - highestTime;
                    if (elapsedMins < 0) elapsedMins += 24 * 60; // Cross-midnight
                    
                    if (elapsedMins >= 60) {
                        const elapsedStr = Math.floor(elapsedMins / 60);
                        // Make sure we don't duplicate the text
                        const baseActivity = currentActivity.replace(/ \(Sudah berlangsung \d+ jam\)$/, '');
                        existingState.aktivitas = `${baseActivity} (Sudah berlangsung ${elapsedStr} jam)`;
                    } else {
                        existingState.aktivitas = currentActivity;
                    }
                }
            }
        }
    }
    
    // Clean up relational desyncs caused by schedule jumps
    this.gameState.enforceTopologicalSync();
  }
}
