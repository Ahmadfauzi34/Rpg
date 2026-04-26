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
    const escapeRegex = (str: string) => str.replace(/[_]/g, " ").toLowerCase();

    // 1. Merge terlebih dahulu (simulasikan update state)
    const mergedState: Record<string, NpcState> = JSON.parse(
      JSON.stringify(currentGlobalState),
    );

    for (const incoming of incomingAIState) {
      if (incoming && incoming.nama) {
        // Find existing key
        const normalizedIncoming = escapeRegex(incoming.nama);
        let existingKey = incoming.nama;
        for (const key of Object.keys(mergedState)) {
          if (escapeRegex(key) === normalizedIncoming) {
            existingKey = key;
            break;
          }
        }

        mergedState[existingKey] = { ...mergedState[existingKey], ...incoming };
      }
    }

    const anomalies: AnomalyReport[] = [];
    const names = Object.keys(mergedState);

    // Helper untuk normalisasi nama (Raja_Aldric -> raja aldric)
    const normalizeName = (name: string) =>
      name.replace(/_/g, " ").toLowerCase();

    // 2. Deteksi Anomali
    // Jika Aktivitas NPC A mengandung nama NPC B,
    // Maka Lokasi NPC A HARUS sama dengan Lokasi NPC B
    for (let i = 0; i < names.length; i++) {
      const npcA = mergedState[names[i]];
      if (!npcA.aktivitas && !npcA.activity) continue;

      const rawActA = npcA.aktivitas || npcA.activity || "";
      const actA = rawActA.toLowerCase().replace(/_/g, " ");

      for (let j = 0; j < names.length; j++) {
        if (i === j) continue;

        const nameB = names[j];
        const npcB = mergedState[nameB];

        const normalizedNameB = normalizeName(nameB);
        const escapedName = normalizedNameB.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&",
        );

        // Cek apakah aktivitas A me-mention B
        const nameRegex = new RegExp(`(?:^|\\W)${escapedName}(?:\\W|$)`);

        if (nameRegex.test(actA)) {
          // A menyebut B dalam aktivitasnya
          const locA = (npcA.lokasi || npcA.location || "").toLowerCase().trim();
          const locB = (npcB.lokasi || npcB.location || "").toLowerCase().trim();

          const isLocationCompatible =
            locA === locB ||
            locA === "unknown" ||
            locB === "unknown" ||
            !locA ||
            !locB;

          if (!isLocationCompatible && locA && locB) {
            anomalies.push({
              npcA: npcA.nama,
              npcB: npcB.nama,
              reason: `${npcA.nama} beraktivitas melibatkan ${npcB.nama} di [${locA}], tapi ${npcB.nama} berada di [${locB}].`,
            });

            // AUTO-CORRECT: Putuskan joint.
            // Karena aktivitas A me-mention B tapi B tidak ada di sana,
            // Kita asumsikan relasi ini basi/stale.
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
