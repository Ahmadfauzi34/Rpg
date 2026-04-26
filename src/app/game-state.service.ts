import {Injectable, inject, ApplicationRef} from '@angular/core';
import { TopologicalSyncSystem } from './topology/topological-sync';
import Dexie, { type Table } from 'dexie';

export class GameDatabase extends Dexie {
  engineState!: Table<{ id: string; state: unknown }, string>;

  constructor() {
    super('GuardianEngineDB');
    this.version(1).stores({
      engineState: 'id',
    });
  }
}

export interface McState {
  inventory?: string[];
  status?: string;
  location?: string;
  locationName?: string;
  trust?: Record<string, string>;
  time?: string;
  day?: number;
  stats?: Record<string, string | number>;
  action?: string;
  dialogue?: string;
}

export interface GraphUpdate {
  action: 'bind' | 'unbind';
  entity: string;
  fact: string;
}

export interface QuestState {
  title: string;
  description: string;
  status: 'active' | 'completed' | 'failed';
  objectives: string[];
}

export interface CombatState {
  inCombat: boolean;
  enemies: { name: string, hp: number | string, status: string }[];
  advantage: 'player' | 'enemy' | 'neutral';
}

export interface NarrativeBlock {
  name: string;
  narration: string;
  dialogue: string;
  action: string;
}

export interface ChronicleEntry {
  narrative_blocks?: NarrativeBlock[];
  narrative?: string;
  mc_state?: Partial<McState>;
  npc_state?: NpcState[];
  factions?: FactionState[];
  room_layout?: string;
  environment?: string;
  choices?: {
    id: string; 
    text: string; 
    weight?: number; 
    requirements?: { inventory?: string[]; trust?: Record<string, number> };
  }[];
  graph_updates?: GraphUpdate[];
  quest_updates?: Record<string, QuestState>;
  combat_updates?: CombatState;
  query_lore_keys?: string[];
  update_story_summary?: string;
}

export interface FactionState {
  name: string;
  description: string;
  reputation: number;
  leader?: string;
}

export interface NpcState {
  nama: string;
  lokasi?: string;
  location?: string;
  aktivitas?: string;
  activity?: string;
  mood?: string;
  status?: string;
  _lastScheduleTime?: number; // Internal tracking to prevent overwriting AI customizations
}

@Injectable({
  providedIn: 'root'
})
export class GameStateService {
  chronicle: ChronicleEntry[] = [];
  mcState: Partial<McState> = {
    inventory: ['Pedang Legendaris', 'Tas Kulit', 'Ransum', '100 perak'],
    status: 'Healthy',
    location: 'LOC_YAMATO_VILLAGE',
    locationName: 'Desa Yamato',
    trust: {},
    time: '08:45',
    day: 8,
    stats: {
      strength: "max",
      charisma: 90,
      stamina: 92,
      agility: 68
    }
  };
  factions: Record<string, FactionState> = {
    "Auralis Royal Guard": {
      name: "Auralis Royal Guard",
      description: "Pasukan penjaga ibukota.",
      reputation: 0,
      leader: "Jenderal Kael"
    }
  };
  npcStates: Record<string, NpcState> = {};
  logs: string[] = [];
  
  topologicalAnomalies: string[] = [];
  rollingNpcKeys: string[] = [];
  
  knowledgeGraph: Record<string, string[]> = {
    "Quest Utama": ["Menyelidiki mengapa Pedang Legendaris bereaksi di dekat Hutan Perbatasan."]
  };
  
  activeLoreKeys: string[] = [];
  storySummary = "Kuro baru saja tiba di Desa Yamato setelah perjalanan panjang. Ia membawa Pedang Legendaris yang menjadi incaran banyak faksi.";

  quests: Record<string, QuestState> = {};
  combat: CombatState = { inCombat: false, enemies: [], advantage: 'neutral' };

  aiModel = 'gemini-3.1-pro-preview';
  db = new GameDatabase();
  appRef = inject(ApplicationRef);

  constructor() {
    if (typeof window !== 'undefined') {
      this.loadState();
    }
  }

  async loadState() {
    try {
      const saved = await this.db.engineState.get('guardian_engine_state');
      if (saved && saved.state) {
        const parsed = saved.state as Partial<GameStateService>;
        this.chronicle = parsed.chronicle || [];
        this.mcState = parsed.mcState || this.mcState;
        this.npcStates = parsed.npcStates || {};
        this.factions = parsed.factions || this.factions;
        this.logs = parsed.logs || [];
        this.knowledgeGraph = parsed.knowledgeGraph || this.knowledgeGraph;
        this.activeLoreKeys = parsed.activeLoreKeys || [];
        this.storySummary = parsed.storySummary || this.storySummary;
        this.quests = parsed.quests || {};
        this.combat = parsed.combat || this.combat;
        this.aiModel = parsed.aiModel || this.aiModel;
      }
      this.appRef.tick();
    } catch (e) {
      console.error("Failed to load state from Dexie", e);
    }
  }

  setAiModel(model: string) {
    this.aiModel = model;
    this.saveState();
  }

  private async saveState() {
    if (typeof window !== 'undefined') {
      try {
        await this.db.engineState.put({
          id: 'guardian_engine_state',
          state: {
            chronicle: this.chronicle,
            mcState: this.mcState,
            npcStates: this.npcStates,
            factions: this.factions,
            logs: this.logs,
            knowledgeGraph: this.knowledgeGraph,
            activeLoreKeys: this.activeLoreKeys,
            storySummary: this.storySummary,
            quests: this.quests,
            combat: this.combat,
            aiModel: this.aiModel
          }
        });
      } catch (e) {
        console.error("Failed to save state to Dexie", e);
      }
    }
  }

  addLog(log: string) {
    this.logs.push(log);
    this.saveState();
  }

  addChronicleEntry(entry: ChronicleEntry) {
    this.chronicle.push(entry);
    this.saveState();
  }
  
  updateMcState(newState: Partial<McState>) {
    this.mcState = { ...this.mcState, ...newState };
    this.saveState();
  }

  updateNpcStates(newNpcs: NpcState[]) {
    if (!newNpcs || !Array.isArray(newNpcs)) return;
    
    // Resolve any anomalies in joint states before applying
    const { resolvedState, anomalies } = TopologicalSyncSystem.resolveState(this.npcStates, newNpcs);
    
    this.topologicalAnomalies = [];
    anomalies.forEach(anomaly => {
      const msg = `[Topological Warning] Desync detected: ${anomaly.reason} Auto-correcting ${anomaly.npcA}.`;
      this.addLog(msg);
      this.topologicalAnomalies.push(msg);
    });

    this.npcStates = resolvedState;
    this.saveState();
  }

  enforceTopologicalSync() {
    // Re-evaluate the current state itself to auto-correct schedule-induced anomalies
    const { resolvedState, anomalies } = TopologicalSyncSystem.resolveState(this.npcStates, []);
    
    anomalies.forEach(anomaly => {
      const msg = `[Topological Warning] Desync detected from schedule: ${anomaly.reason} Auto-correcting ${anomaly.npcA}.`;
      this.addLog(msg);
      // We don't necessarily push this to AI topologicalAnomalies for the prompt, or maybe we do
      this.topologicalAnomalies.push(msg);
    });

    this.npcStates = resolvedState;
    this.saveState();
  }

  updateFactions(newFactions: FactionState[]) {
    if (!newFactions || !Array.isArray(newFactions)) return;
    newFactions.forEach(faction => {
      if (faction && faction.name) {
        this.factions[faction.name] = { ...this.factions[faction.name], ...faction };
      }
    });
    this.factions = { ...this.factions };
    this.saveState();
  }
  
  updateKnowledgeGraph(updates: GraphUpdate[]) {
    if (!updates || !Array.isArray(updates)) return;
    updates.forEach(u => {
      if (!this.knowledgeGraph[u.entity]) {
        this.knowledgeGraph[u.entity] = [];
      }
      if (u.action === 'bind') {
        if (!this.knowledgeGraph[u.entity].includes(u.fact)) {
          this.knowledgeGraph[u.entity].push(u.fact);
        }
      } else if (u.action === 'unbind') {
        this.knowledgeGraph[u.entity] = this.knowledgeGraph[u.entity].filter(f => f !== u.fact);
        if (this.knowledgeGraph[u.entity].length === 0) {
          delete this.knowledgeGraph[u.entity];
        }
      }
    });
    this.saveState();
  }
  
  updateActiveLoreKeys(keys: string[]) {
    this.activeLoreKeys = Array.isArray(keys) ? keys : [];
    this.saveState();
  }
  
  updateQuests(updates?: Record<string, QuestState>) {
    if (!updates) return;
    Object.keys(updates).forEach(questId => {
      this.quests[questId] = { ...this.quests[questId], ...updates[questId] };
    });
    this.saveState();
  }

  updateCombat(update?: CombatState) {
    if (!update) return;
    this.combat = { ...this.combat, ...update };
    this.saveState();
  }

  updateStorySummary(summary: string) {
    if (summary) {
      this.storySummary = summary;
      this.saveState();
    }
  }
  
  async resetState() {
     if (typeof window !== 'undefined') {
       await this.db.engineState.delete('guardian_engine_state');
       window.location.reload();
     }
  }
}
