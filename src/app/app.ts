import {ChangeDetectionStrategy, Component, inject} from '@angular/core';
import {StoryComponent} from './story.component';
import {CharacterComponent} from './character.component';
import {EngineLogComponent} from './engine-log.component';
import {NpcMapComponent} from './npc-map.component';
import {KnowledgeGraphComponent} from './knowledge-graph.component';
import {MatIconModule} from '@angular/material/icon';
import {GameStateService} from './game-state.service';
import {LoreEngineService} from './rag/lore-engine.service';
import {CommonModule} from '@angular/common';

import {FormsModule} from '@angular/forms';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-root',
  imports: [StoryComponent, CharacterComponent, EngineLogComponent, NpcMapComponent, KnowledgeGraphComponent, MatIconModule, CommonModule, FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  activeTab = 'story';
  showMap = false;
  showSidebar = false;
  activeModal: 'none' | 'settings' | 'history' | 'factions' | 'lore' | 'graph' | 'quests' = 'none';
  
  gameState = inject(GameStateService);
  loreEngine = inject(LoreEngineService);

  getQuests() {
    return Object.entries(this.gameState.quests).map(([id, q]) => ({ id, ...q }));
  }

  toggleMap() {
    this.showMap = !this.showMap;
  }

  toggleSidebar() {
    this.showSidebar = !this.showSidebar;
  }

  openModal(modal: 'settings' | 'history' | 'factions' | 'lore' | 'graph' | 'quests') {
    this.activeModal = modal;
    this.showSidebar = false;
  }

  closeModal() {
    this.activeModal = 'none';
  }

  getGraphKeys(): string[] {
    return Object.keys(this.gameState.knowledgeGraph || {});
  }

  getFactionKeys(): string[] {
    return Object.keys(this.gameState.factions || {});
  }

  getNpcKeys(): string[] {
    const allKeys = Object.keys(this.gameState.npcStates || {});
    if (this.gameState.rollingNpcKeys && this.gameState.rollingNpcKeys.length > 0) {
      return allKeys.filter(k => this.gameState.rollingNpcKeys.includes(k));
    }
    return allKeys.slice(0, 3);
  }
}
