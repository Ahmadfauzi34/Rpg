import { describe, it, expect } from 'vitest';
import { TopologicalSyncSystem } from './topological-sync';
import { NpcState } from '../game-state.service';

describe('TopologicalSyncSystem', () => {

  it('should not mutate valid joint states', () => {
    const globalState: Record<string, NpcState> = {
      "Raja Aldric": { nama: "Raja Aldric", lokasi: "Kamar", aktivitas: "Bersantai dengan Ratu Selene" },
      "Ratu Selene": { nama: "Ratu Selene", lokasi: "Kamar", aktivitas: "Melayani batin Raja Aldric" }
    };
    
    // AI merespon dengan state tidak ada perubahan
    const incoming: NpcState[] = [];

    const { resolvedState, anomalies } = TopologicalSyncSystem.resolveState(globalState, incoming);
    
    expect(anomalies.length).toBe(0);
    expect(resolvedState['Ratu Selene'].aktivitas).toBe("Melayani batin Raja Aldric");
  });

  it('should detect and auto-correct topological anomaly when one NPC moves abruptly', () => {
    const globalState: Record<string, NpcState> = {
      "Raja_Aldric": { nama: "Raja Aldric", lokasi: "Kamar", aktivitas: "Bersantai dengan Ratu Selene" },
      "Ratu_Selene": { nama: "Ratu Selene", lokasi: "Kamar", aktivitas: "Melayani batin Raja Aldric" }
    };
    
    // AI tiba-tiba memindahkan Raja ke Aula Utama, tapi Ratu tidak disebutkan ikut
    const incoming: NpcState[] = [
      { nama: "Raja Aldric", lokasi: "Aula Utama", aktivitas: "Memimpin Rapat Dewan" }
    ];

    const { resolvedState, anomalies } = TopologicalSyncSystem.resolveState(globalState, incoming);
    
    // Harusnya Ratu Selene terkena auto-correct karena Raja pindah
    expect(anomalies.length).toBe(1);
    expect(anomalies[0].npcA).toBe('Ratu Selene');
    expect(anomalies[0].npcB).toBe('Raja Aldric');
    
    // Raja berhasil pindah (dan data tertuju ke key Raja_Aldric yang ada)
    expect(resolvedState['Raja_Aldric'].lokasi).toBe("Aula Utama");
    expect(resolvedState['Raja_Aldric'].aktivitas).toBe("Memimpin Rapat Dewan");
    
    // Aktivitas ratu harusnya direset, tidak lagi melayani Raja yang ga ada
    expect(resolvedState['Ratu_Selene'].lokasi).toBe("Kamar");
    expect(resolvedState['Ratu_Selene'].aktivitas).toBe("Berada sendirian setelah ditinggalkan.");
  });

});
