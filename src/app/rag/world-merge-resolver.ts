import { MultiWorldHologram } from './multi-world';
import { HolographicMemoryField } from './holographic-memory';

/**
 * Conflict Type dalam merge lore
 */
export type ConflictType = 
  | 'direct_contradiction'    // A bilang X, B bilang not-X
  | 'divergent_path'          // A dan B valid tapi mutually exclusive timeline
  | 'detail_mismatch'         // Minor inconsistency (lokasi, waktu)
  | 'coherence_gap';          // Salah satu branch tidak coherent dengan trunk

/**
 * Single conflict entry
 */
export interface LoreConflict {
  docId: number;
  type: ConflictType;
  severity: number;           // 0-1, berapa parah konfliknya
  worldA: number;
  worldB: number;
  coherenceA: number;
  coherenceB: number;
  resolution: 'keep_a' | 'keep_b' | 'merge_weighted' | 'flag_for_llm';
  explanation: string;
}

/**
 * Merge result dengan audit trail
 */
export interface MergeResult {
  success: boolean;
  mergedWorld: number;        // target world ID
  conflicts: LoreConflict[];
  autoResolved: number;
  flaggedForLLM: number;
  finalCoherence: number;
  auditLog: string[];
}

/**
 * World Merge Conflict Resolver
 * 
 * Strategi:
 * 1. Compare doc-by-doc antar branch yang akan di-merge
 * 2. Untuk setiap doc yang ada di kedua branch: cek consistency
 * 3. Pilih versi dengan coherence tertinggi
 * 4. Kalau coherence mirip → weighted merge (superposisi)
 * 5. Kalau direct contradiction → flag atau auto-pilih berdasarkan trunk priority
 */
export class WorldMergeResolver {
  readonly multiWorld: MultiWorldHologram;
  readonly dim: number;
  readonly numDocs: number;
  readonly docVectors: Float32Array;
  
  // Pre-allocated buffers
  readonly reconA: Float32Array;
  readonly reconB: Float32Array;
  readonly diffVec: Float32Array;
  readonly mergedVec: Float32Array;
  readonly tempDocVec: Float32Array;
  readonly conflictBuffer: LoreConflict[];
  readonly auditBuffer: string[];

  constructor(multiWorld: MultiWorldHologram, dim: number, numDocs: number, docVectors: Float32Array) {
    this.multiWorld = multiWorld;
    this.dim = dim;
    this.numDocs = numDocs;
    this.docVectors = docVectors;
    
    this.reconA = new Float32Array(dim);
    this.reconB = new Float32Array(dim);
    this.diffVec = new Float32Array(dim);
    this.mergedVec = new Float32Array(dim);
    this.tempDocVec = new Float32Array(dim);
    this.conflictBuffer = new Array(256); // max conflicts
    this.auditBuffer = new Array(64);
  }

  /**
   * Main entry: merge sourceWorld ke targetWorld
   * 
   * @param sourceWorld branch yang akan di-merge (biasanya player choice branch)
   * @param targetWorld trunk/destination (biasanya world 0)
   * @param autoThreshold threshold untuk auto-resolve vs flag LLM
   * @param trunkPriority kalau true, trunk menang kalau coherence tie
   */
  resolve(
    sourceWorld: number,
    targetWorld: number,
    autoThreshold = 0.15,     // diff coherence < 15% → auto merge
    trunkPriority = true
  ): MergeResult {
    const { multiWorld, dim, numDocs } = this;
    
    if (!multiWorld.active[sourceWorld] || !multiWorld.active[targetWorld]) {
      return {
        success: false,
        mergedWorld: targetWorld,
        conflicts: [],
        autoResolved: 0,
        flaggedForLLM: 0,
        finalCoherence: 0,
        auditLog: ['ERROR: Source or target world inactive']
      };
    }

    const src = multiWorld.worlds[sourceWorld];
    const dst = multiWorld.worlds[targetWorld];
    
    let conflictCount = 0;
    let autoResolved = 0;
    let flagged = 0;
    let auditIdx = 0;
    
    // Audit: start merge
    this.auditBuffer[auditIdx++] = `MERGE START: ${multiWorld.worldNames[sourceWorld]} → ${multiWorld.worldNames[targetWorld]}`;

    // Phase 1: Scan semua doc yang ada di kedua world
    for (let d = 0; d < numDocs; d++) {
      const wA = src!.docWeights[d]!;
      const wB = dst!.docWeights[d]!;
      
      // Skip kalau tidak ada di kedua world (no conflict)
      if (wA <= 1e-10 && wB <= 1e-10) continue;
      
      // Case: hanya ada di source → copy ke target
      if (wB <= 1e-10 && wA > 1e-10) {
        const vec = this._getDocVector(d);
        dst!.encode(d, vec, wA);
        this.auditBuffer[auditIdx++] = `COPY doc[${d}] from source (weight ${wA.toFixed(4)})`;
        continue;
      }
      
      // Case: ada di kedua → cek conflict
      if (wA > 1e-10 && wB > 1e-10) {
        const cohA = this._docCoherence(d, src, this.reconA);
        const cohB = this._docCoherence(d, dst, this.reconB);
        const diff = Math.abs(cohA - cohB);
        
        // Hitung diff vector untuk cek contradiction
        const contradiction = this._checkContradiction(this.reconA, this.reconB);
        
        let resolution: LoreConflict['resolution'];
        let severity = diff;
        let type: ConflictType;
        let explanation: string;
        
        if (contradiction > 0.7) {
          // Direct contradiction: vector berlawanan arah
          type = 'direct_contradiction';
          severity = 1.0;
          
          if (diff < autoThreshold) {
            // Coherence mirip tapi contradictory → flag LLM (butuh human judgment)
            resolution = 'flag_for_llm';
            flagged++;
            explanation = `Direct contradiction with similar coherence (${cohA.toFixed(2)} vs ${cohB.toFixed(2)})`;
          } else if (trunkPriority) {
            resolution = 'keep_b';
            autoResolved++;
            explanation = `Direct contradiction, trunk wins (trunkPriority=true)`;
          } else {
            resolution = cohA > cohB ? 'keep_a' : 'keep_b';
            autoResolved++;
            explanation = `Direct contradiction, higher coherence wins`;
          }
        } else if (diff < autoThreshold) {
          // Coherence mirip, tidak contradictory → weighted merge
          type = 'detail_mismatch';
          resolution = 'merge_weighted';
          autoResolved++;
          const totalW = wA + wB;
          const newW = totalW * 0.5; // average weight
          this._weightedMergeVectors(this.reconA, wA, this.reconB, wB, this.mergedVec);
          dst!.encode(d, this.mergedVec, newW);
          explanation = `Minor mismatch, weighted merge (${cohA.toFixed(2)} vs ${cohB.toFixed(2)})`;
        } else {
          // Coherence berbeda jauh → pilih yang coherent
          type = 'divergent_path';
          severity = diff;
          resolution = cohA > cohB ? 'keep_a' : 'keep_b';
          autoResolved++;
          explanation = `Divergent path, higher coherence wins (${cohA.toFixed(2)} vs ${cohB.toFixed(2)})`;
        }
        
        // Apply resolution (kecuali merge_weighted yang sudah di-apply)
        if (resolution === 'keep_a') {
          const vec = this._getDocVector(d);
          dst!.encode(d, vec, wA);
        } else if (resolution === 'keep_b') {
          // Keep existing, do nothing
        }
        
        // Record conflict
        if (conflictCount < this.conflictBuffer.length) {
          this.conflictBuffer[conflictCount++] = {
            docId: d,
            type,
            severity,
            worldA: sourceWorld,
            worldB: targetWorld,
            coherenceA: cohA,
            coherenceB: cohB,
            resolution,
            explanation
          };
        }
        
        this.auditBuffer[auditIdx++] = `[${type}] doc[${d}]: ${explanation} → ${resolution}`;
      }
    }

    // Phase 2: Update target world superposition
    multiWorld.superposition[targetWorld] = Math.min(
      1.0,
      (multiWorld.superposition[targetWorld] || 0) + (multiWorld.superposition[sourceWorld] || 0) * 0.5
    );

    // Phase 3: Final coherence check
    const testVec = new Float32Array(dim);
    testVec[0] = 1.0; // dummy query untuk cek health
    const finalCoh = dst!.reconstruct(testVec, this.mergedVec);

    // Prune source setelah merge
    multiWorld.prune(sourceWorld);

    this.auditBuffer[auditIdx++] = `MERGE END: ${autoResolved} auto, ${flagged} flagged, final coherence ${finalCoh.toFixed(3)}`;

    return {
      success: true,
      mergedWorld: targetWorld,
      conflicts: this.conflictBuffer.slice(0, conflictCount),
      autoResolved,
      flaggedForLLM: flagged,
      finalCoherence: finalCoh,
      auditLog: this.auditBuffer.slice(0, auditIdx)
    };
  }

  /**
   * Fast coherence check untuk single doc dalam world
   * reconstruct doc vector lalu cek self-consistency
   */
  private _docCoherence(docId: number, world: HolographicMemoryField, out: Float32Array): number {
    const vec = this._getDocVector(docId);
    const invTotal = world.totalWeight > 1e-10 ? 1.0 / world.totalWeight : 0;
    let dot = 0, norm1 = 0, norm2 = 0;
    for(let i=0; i<this.dim; i++) {
      const mu = world.firstMoment[i]! * invTotal;
      dot += vec[i]! * mu;
      norm1 += vec[i]! * vec[i]!;
      norm2 += mu * mu;
    }
    const denom = Math.sqrt(norm1 * norm2);
    // Kita isi out dengan vec agar pipeline selanjutnya seperti _weightedMergeVectors tetap memiliki input valid.
    out.set(vec);
    return denom > 1e-10 ? dot / denom : 0;
  }

  /**
   * Cek apakah dua vector contradictory (berlawanan arah)
   * Return: 0 = aligned, 1 = opposite
   */
  private _checkContradiction(a: Float32Array, b: Float32Array): number {
    let dot = 0;
    for (let i = 0; i < this.dim; i++) {
      dot += a[i]! * b[i]!;
    }
    // dot = 1 → same, dot = -1 → opposite
    return (1.0 - dot) * 0.5; // normalize to 0-1
  }

  /**
   * Weighted merge dua vector: out = (wA*a + wB*b) / (wA+wB)
   */
  private _weightedMergeVectors(
    a: Float32Array, wA: number,
    b: Float32Array, wB: number,
    out: Float32Array
  ): void {
    const total = wA + wB;
    const invTotal = total > 1e-10 ? 1.0 / total : 0;
    for (let i = 0; i < this.dim; i++) {
      out[i] = (a[i]! * wA + b[i]! * wB) * invTotal;
    }
  }

  /**
   * Get doc vector dari docFHRR reference
   * docVectors is flat [numDocs * dim]
   */
  private _getDocVector(docId: number): Float32Array {
    const offset = docId * this.dim;
    return this.docVectors.slice(offset, offset + this.dim);
  }

  // === BATCH MERGE: Merge multiple branches ke trunk ===
  
  /**
   * Merge semua active branch ke trunk secara berurutan
   * Priority: branch dengan coherence tertinggi dulu
   */
  resolveAllToTrunk(trunkWorld = 0): MergeResult[] {
    const results: MergeResult[] = [];
    
    // Collect active branches (bukan trunk)
    const branches: { id: number; coherence: number }[] = [];
    for (let w = 0; w < this.multiWorld.maxWorlds; w++) {
      if (w === trunkWorld) continue;
      if (!this.multiWorld.active[w]) continue;
      
      // Estimate branch coherence dari rolling stats
      const testVec = new Float32Array(this.dim);
      testVec[0] = 1.0;
      const coh = this.multiWorld.worlds[w]!.reconstruct(testVec, this.diffVec); // approx coherence
      branches.push({ id: w, coherence: coh });
    }
    
    // Sort: merge yang paling coherent dulu (least destructive)
    branches.sort((a, b) => b.coherence - a.coherence);
    
    for (const branch of branches) {
      const res = this.resolve(branch.id, trunkWorld);
      results.push(res);
    }
    
    return results;
  }
}
