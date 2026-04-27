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
    // Create a dictionary of normalized names to locations for O(1) lookups
    const npcMap = new Map<string, { npc: NpcState; loc: string }>();
    const namesList: string[] = [];

    for (const npc of npcList) {
      if (!npc.nama) continue;
      const normalizedName = normalizeName(npc.nama);
      npcMap.set(normalizedName, {
        npc,
        loc: (npc.lokasi || npc.location || "").toLowerCase().trim()
      });
      namesList.push(normalizedName);
    }

    // Sort names by length descending to match longest names first (e.g., "Budi Santoso" before "Budi")
    namesList.sort((a, b) => b.length - a.length);
    const escapedNames = namesList.map(escapeRegex);

    // Master Regex to extract all mentioned names in a single pass
    // Use lookahead for trailing boundary so we don't consume characters that might start the next word
    const masterRegex = new RegExp(`(?:^|\\W)(${escapedNames.join('|')})(?=\\W|$)`, 'gi');

    // 3. Deteksi Anomali - O(N) where N is number of NPCs
    for (const npcA of npcList) {
      if (!npcA.aktivitas && !npcA.activity) continue;

      const actA = (npcA.aktivitas || npcA.activity || "").toLowerCase().replace(/_/g, " ");
      const normalizedNpcAName = normalizeName(npcA.nama);

      const locA = (npcA.lokasi || npcA.location || "").toLowerCase().trim();

      masterRegex.lastIndex = 0;
      let match;
      const mentionedNames = new Set<string>();

      // Extract all mentioned names in O(1) time relative to number of NPCs (depends on string length)
      while ((match = masterRegex.exec(actA)) !== null) {
        mentionedNames.add(match[1].toLowerCase());

        // Advance lastIndex safely
        if (match.index === masterRegex.lastIndex) {
          masterRegex.lastIndex++;
        }
      }

      for (const mentionedName of mentionedNames) {
        if (mentionedName === normalizedNpcAName) continue;

        const dataB = npcMap.get(mentionedName);
        if (dataB) {
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
