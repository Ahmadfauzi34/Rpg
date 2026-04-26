import {Injectable, signal, inject} from '@angular/core';
import {GoogleGenAI} from '@google/genai';
import {GameStateService, ChronicleEntry} from './game-state.service';
import {SYSTEM_RULES} from './system-rules';
import {LoreEngineService} from './rag/lore-engine.service';
import {ChronosEngineService} from './chronos-engine.service';

const ai = new GoogleGenAI({apiKey: GEMINI_API_KEY});

@Injectable({
  providedIn: 'root',
})
export class EngineService {
  isProcessing = signal(false);
  gameState = inject(GameStateService);
  loreEngine = inject(LoreEngineService);
  chronosEngine = inject(ChronosEngineService);

  async processTurn(playerChoice: string) {
    this.isProcessing.set(true);
    this.gameState.addLog('Player choice: ' + playerChoice);
    
    try {
      const prompt = await this.buildPrompt(playerChoice);
      const response = await ai.models.generateContent({
        model: this.gameState.aiModel,
        contents: prompt,
        config: {
          systemInstruction: 'Anda adalah Guardian Engine OS v2.0. Jalankan alur kerja 6-Langkah secara ketat. Output pertama adalah internal_guardian_monologue wajib teks ringkas, diikuti dengan block JSON lengkap. Gunakan "graph_updates" (bind/unbind/reweight) untuk menyimpan fakta persisten / mengubah memory. HATI-HATI: Gunakan "unbind" HANYA untuk membuang memori yang sudah tidak relevan/selesai, JANGAN hapus history alur penting!',
          temperature: 0.5,
        }
      });
      
      const text = response.text || '';
      this.handleResponse(text);
      await this.loreEngine.refreshDynamicContext();
    } catch (e: unknown) {
      if (e instanceof Error) {
        this.gameState.addLog('Error: ' + e.message);
      }
    } finally {
      this.isProcessing.set(false);
    }
  }

  private async buildPrompt(playerChoice: string) {
    const currentLocation = this.gameState.mcState.locationName || this.gameState.mcState.location || 'Unknown';
    const activeEntities = this._extractEntities(playerChoice);
    const contextTags = [currentLocation, 'narrative'];

    const dynamicContext = await this.loreEngine.getContextSnippet(
      currentLocation,
      activeEntities,
      contextTags,
      playerChoice
    );

    const staticSnippets: string[] = [];
    if (this.gameState.activeLoreKeys?.length > 0) {
      const book = (SYSTEM_RULES as { lorebook_database?: Record<string, string> })?.lorebook_database || {};
      this.gameState.activeLoreKeys.forEach((k: string) => {
        if (book[k]) staticSnippets.push(`[${k}]: ${book[k]}`);
      });
    }

    const backgroundNpcsEntries = Object.entries(this.gameState.npcStates);
    for (let i = backgroundNpcsEntries.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [backgroundNpcsEntries[i], backgroundNpcsEntries[j]] = [backgroundNpcsEntries[j], backgroundNpcsEntries[i]];
    }
    const rollingNpcs = Object.fromEntries(backgroundNpcsEntries.slice(0, 3));
    this.gameState.rollingNpcKeys = Object.keys(rollingNpcs);

    return `
      System Rules:
      ${JSON.stringify(SYSTEM_RULES, null, 2)}
      
      Current Game State:
      Time: ${this.gameState.mcState.time} (Day ${this.gameState.mcState.day})
      Location: ${this.gameState.mcState.locationName} (${this.gameState.mcState.location})
      Inventory: ${JSON.stringify(this.gameState.mcState.inventory)}
      Status: ${this.gameState.mcState.status}
      Stats: ${JSON.stringify(this.gameState.mcState.stats)}
      
      KNOWLEDGE GRAPH (Fakta Persisten / Long-Term Memory):
      ${JSON.stringify(this.gameState.knowledgeGraph, null, 2)}
      
      STORY SUMMARY (Ringkasan Narasi Keseluruhan):
      ${this.gameState.storySummary}

      ACTIVE QUESTS:
      ${JSON.stringify(this.gameState.quests, null, 2)}
      
      COMBAT STATE:
      ${JSON.stringify(this.gameState.combat, null, 2)}

      WORLD STATE (NPC DI LUAR LOKASI PEMAIN):
      Berikut adalah sebagian aktivitas NPC di latar belakang.
      Catatan: Jadwal NPC adalah panduan, bukan aturan kaku. Mereka bisa terlambat, mengubah rencana, atau bereaksi secara dinamis. Anda bebas menyesuaikan aktivitas dan lokasi mereka bila situasi cerita membutuhkannya. Namun, jangan jadikan mereka sebagai pilihan (choices) jika player belum berada di lokasi mereka.
      ${JSON.stringify(rollingNpcs, null, 2)}
      
      ${this.gameState.topologicalAnomalies.length > 0 ? `[CRITICAL SYSTEM FEEDBACK DARI GILIRAN SEBELUMNYA]:\n${this.gameState.topologicalAnomalies.join('\n')}\nTolong perbaiki relasi mereka jika perlu (atau perjelas perpisahan mereka).` : ''}

      ${dynamicContext}

      STATIC LOREBOOK (Active Keys):
      ${staticSnippets.length > 0 ? staticSnippets.join('\n') : 'Tidak ada Lore spesifik yang aktif.'}
      
      CURRENT FACTIONS STATE:
      ${JSON.stringify(this.gameState.factions, null, 2)}
      
      Recent Chronicle:
      ${JSON.stringify(this.gameState.chronicle.slice(-3), null, 2)}
      
      Player Choice: "${playerChoice}"
      
      Jalankan 6 langkah:
      1. CHRONOS
      2. CONTEXTUS
      3. ANIMA
      4. LOGICA
      5. SCRIPTOR
      6. ASSEMBLER
      
      Gunakan format laporan eksekutif ringkas untuk monolog.
      Lalu buat blok \`\`\`json berisi:
      {
        "new_full_chronicle_entry": {
          "narrative": "Ringkasan fallback narasi singkat",
          "narrative_blocks": [
            {
              "name": "nama karakter (mc atau npc)",
              "narration": "deskripsi narasi dari sudut pandang karakter",
              "dialogue": "dialog karakter jika ada",
              "action": "aksi fisik karakter"
            }
          ],
          "_note": "mc tidak harus berada di index pertama array narrative_blocks, tergantung kronologis adegan. buat block baru untuk setiap giliran/reaksi.",
          "mc_state": { 
            "action": "...", 
            "dialogue": "...", 
            "inventory": ["...", "..."], 
            "status": "...",
            "stats": {"strength": "...", "charisma": 90, "stamina": 92, "agility": 68},
            "location": "...",
            "locationName": "...",
            "time": "...",
            "day": 0,
            "trust": {"Nama NPC": "..."}
          },
          "npc_state": [
            {
              "_note": "HANYA masukkan NPC yang berada di LOKASI YANG SAMA dengan MC saat ini. Jangan masukkan NPC yang di luar jangkauan.",
              "nama": "...", "lokasi": "Detail lokasi (cth: Kamar Utama / Luar)", "aktivitas": "...", "mood": "...", "status": "..."
            }
          ],
          "factions": [
            {"name": "...", "description": "...", "reputation": 10, "leader": "..."}
          ],
          "room_layout": "...",
          "environment": "...",
          "graph_updates": [
            { "action": "bind|unbind|reweight", "entity": "...", "fact": "...", "weight": 1.0 }
          ],
          "quest_updates": {
            "quest_id_1": { "title": "...", "description": "...", "status": "active|completed|failed", "objectives": ["..."] }
          },
          "combat_updates": {
            "inCombat": false,
            "enemies": [{"name": "...", "hp": "...", "status": "..."}],
            "advantage": "neutral|player|enemy"
          },
          "query_lore_keys": [ "Auralis", "Yamato" ],
          "update_story_summary": "...",
          "choices": [ 
            // MAX 3 PILIHAN SAJA. Jangan lebih.
            {
              "id": "C-1", 
              "text": "...", 
              "weight": 0.8, 
              "targetEntity": "...", 
              "targetFaction": "...",
              "requirements": {
                 "inventory": ["Pedang Legendaris"],
                 "trust": {"kerajaan_auralis": 20}
              }
            } 
          ]
        },
        "new_summary_for_index": "..."
      }
    `;
  }

  private handleResponse(text: string) {
    const jsonMatch = text.match(/```json\s*(\{[\s\S]*?\})\s*```/);
    let monologue = text;
    let jsonOutput: { new_full_chronicle_entry?: ChronicleEntry } | null = null;

    if (jsonMatch) {
      monologue = text.replace(jsonMatch[0], '').trim();
      try {
        jsonOutput = JSON.parse(jsonMatch[1]);
      } catch (e) {
        console.error('Failed to parse JSON', e);
      }
    }

    this.gameState.addLog('Engine Monologue:\n' + monologue);
    
    if (jsonOutput && jsonOutput.new_full_chronicle_entry) {
      const entry = jsonOutput.new_full_chronicle_entry;

      if (Array.isArray(entry.choices) && entry.choices.length > 0) {
        const scored = this.loreEngine.scoreChoices(entry.choices);
        
        // Log rejected choices for diagnostic transparency
        scored.filter(s => !s.isValid).forEach(rejected => {
            this.gameState.addLog(`[Sistem Filtrasi] Membuang opsi tidak valid: "${rejected.text}". Alasan: ${rejected.failureReasons?.join(', ')}`);
        });

        entry.choices = scored
          .filter(s => s.isValid)
          .slice(0, 3)
          .map(s => ({ id: s.id, text: s.text, weight: s.weight }));
      }

      this.gameState.addChronicleEntry(entry);
      if (entry.mc_state) {
        this.gameState.updateMcState(entry.mc_state);
        // Sync time updates with world simulation rules
        this.chronosEngine.advanceTime(0); 
      }
      if (entry.npc_state && Array.isArray(entry.npc_state)) {
        this.gameState.updateNpcStates(entry.npc_state);
      }
      
      if (entry.factions && Array.isArray(entry.factions)) {
        this.gameState.updateFactions(entry.factions);
      }
      
      if (entry.graph_updates && Array.isArray(entry.graph_updates)) {
        this.gameState.updateKnowledgeGraph(entry.graph_updates);
        this.loreEngine.syncKnowledgeGraph();
      }
      
      if (entry.quest_updates) {
        this.gameState.updateQuests(entry.quest_updates);
      }
      
      if (entry.combat_updates !== undefined) {
        this.gameState.updateCombat(entry.combat_updates);
      }
      
      if (entry.query_lore_keys && Array.isArray(entry.query_lore_keys)) {
        this.gameState.updateActiveLoreKeys(entry.query_lore_keys);
      } else {
        this.gameState.updateActiveLoreKeys([]);
      }

      if (entry.update_story_summary && typeof entry.update_story_summary === 'string') {
        this.gameState.updateStorySummary(entry.update_story_summary);
      }
    }
  }

  private _extractEntities(playerChoice: string): string[] {
    const set = new Set<string>();
    const choiceLower = playerChoice.toLowerCase();
    
    if (this.gameState.npcStates) {
      Object.entries(this.gameState.npcStates).forEach(([name, npc]: [string, { lokasi?: string }]) => {
        // Hanya ambil NPC di lokasi yang sama atau yang disebut pemain
        if (npc.lokasi === this.gameState.mcState.locationName || npc.lokasi === this.gameState.mcState.location || choiceLower.includes(name.toLowerCase())) {
          set.add(name);
        }
      });
    }
    
    if (this.gameState.knowledgeGraph) {
      Object.keys(this.gameState.knowledgeGraph).forEach(e => {
        if (choiceLower.includes(e.toLowerCase())) set.add(e);
      });
    }
    
    if (this.gameState.factions) {
      Object.entries(this.gameState.factions).forEach(([fname, f]: [string, { leader?: string }]) => {
        if (choiceLower.includes(fname.toLowerCase()) || (f.leader && choiceLower.includes(f.leader.toLowerCase()))) {
          if (f.leader) set.add(f.leader);
          set.add(fname);
        }
      });
    }
    return Array.from(set);
  }
}
