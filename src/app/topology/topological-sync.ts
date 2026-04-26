import { NpcState } from "../game-state.service";

/**
 * Laporan anomali untuk membantu AI memperbaiki relasi di giliran berikutnya.
 */
export interface AnomalyReport {
  npcA: string;
  npcB: string;
  reason: string;
}

/**
 * Menyelesaikan anomali topologi (desync antar karakter).
 */
export class TopologicalSyncSystem {
  /**
   * Evaluasi state global dengan state baru (parsial dari AI)
   *
   * @param currentGlobalState State NPC global saat ini
   * @param incomingAIState State NPC terbaru dari output AI
   * @returns State NPC global yang sudah dikoreksi & daftar anomali
   */
  static resolveState(
    currentGlobalState: Record<string, NpcState>,
    incomingAIState: NpcState[],
  ): { resolvedState: Record<string, NpcState>; anomalies: AnomalyReport[] } {
    // Helper untuk normalisasi nama
    const normalizeName = (str: string) => str.replace(/[_]/g, " ").toLowerCase();
    const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // 1. Merge terlebih dahulu (simulasikan update state)
    const mergedState: Record<string, NpcState> = JSON.parse(
      JSON.stringify(currentGlobalState),
    );

    for (const incoming of incomingAIState) {
      if (incoming && incoming.nama) {
        // Find existing key
        const normalizedIncoming = normalizeName(incoming.nama);
        let existingKey = incoming.nama;
        for (const key of Object.keys(mergedState)) {
          if (normalizeName(key) === normalizedIncoming) {
            existingKey = key;
            break;
          }
        }

        mergedState[existingKey] = { ...mergedState[existingKey], ...incoming };
      }
    }

    const anomalies: AnomalyReport[] = [];
    const npcList = Object.values(mergedState);

    // 2. Pre-compute and index
    // Create an index of normalized names and compiled Regexes to avoid O(N^2) recompilation
    interface NpcIndex {
      npc: NpcState;
      loc: string;
      matcher: RegExp;
    }

    const index: NpcIndex[] = npcList.map(npc => {
      const normalizedName = normalizeName(npc.nama);
      const escapedName = escapeRegex(normalizedName);
      return {
        npc,
        loc: (npc.lokasi || npc.location || "").toLowerCase().trim(),
        matcher: new RegExp(`(?:^|\\W)${escapedName}(?:\\W|$)`)
      };
    });

    // 3. Deteksi Anomali - O(N * M) but optimized
    for (const dataA of index) {
      const npcA = dataA.npc;
      if (!npcA.aktivitas && !npcA.activity) continue;

      const actA = (npcA.aktivitas || npcA.activity || "").toLowerCase().replace(/_/g, " ");

      for (const dataB of index) {
        if (dataA.npc === dataB.npc) continue;

        if (dataB.matcher.test(actA)) {
          // A menyebut B dalam aktivitasnya
          const locA = dataA.loc;
          const locB = dataB.loc;

          const isLocationCompatible =
            locA === locB || locA === "unknown" || locB === "unknown" || !locA || !locB;

          if (!isLocationCompatible && locA && locB) {
            anomalies.push({
              npcA: npcA.nama,
              npcB: dataB.npc.nama,
              reason: `${npcA.nama} beraktivitas melibatkan ${dataB.npc.nama} di [${locA}], tapi ${dataB.npc.nama} berada di [${locB}].`,
            });

            // AUTO-CORRECT: Putuskan joint.
            npcA.aktivitas = "Berada sendirian setelah ditinggalkan.";
            npcA.activity = "Berada sendirian setelah ditinggalkan.";
            npcA.mood = "Bertanya-tanya / Netral";
          }
        }
      }
    }

    return { resolvedState: mergedState, anomalies };
  }
}
