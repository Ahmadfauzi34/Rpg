import { HolographicMemoryField } from './holographic-memory';

/**
 * MultiWorld Holographic Kernel
 * 
 * Konsep:
 * - Setiap "world" adalah HolographicMemoryField independen
 * - Superposition: query bisa men-scan satu world, atau weighted blend dari banyak world
 * - Interference: diff antar world menghasilkan residual field (kontradiksi lore)
 * - Branching: fork world zero-copy-ish (pre-allocated slot copy)
 * - Collapse: merge world ke trunk, lalu recycle slot
 * 
 * Use case game text:
 * - Time travel: trunk world + flashback world + future world
 * - What-if: NPC mengambil keputusan A vs B → dua branch
 * - Dream/illusion: world dengan coherence rendah yang bisa di-interrogate
 */
export class MultiWorldHologram {
  readonly maxWorlds: number;
  readonly dim: number;
  readonly numDocs: number;
  readonly historyDepth: number;
  
  // === SOA WORLD ARRAY ===
  readonly worlds: HolographicMemoryField[];
  readonly active: Uint8Array;              // 1 = world occupied
  readonly superposition: Float32Array;     // weight "realness" tiap world
  readonly worldNames: string[];            // debug/label
  
  // === CROSS-WORLD ACCUMULATORS (pre-allocated) ===
  readonly reconAcc: Float32Array;          // [dim] — weighted superposition recon
  readonly diffAcc: Float32Array;           // [dim] — residual buffer
  readonly crossScores: Float32Array;       // [maxWorlds] — coherence per world
  
  // === QUERY STATE ===
  readonly queryMask: Uint8Array;           // [maxWorlds] — worlds to include in query
  private queryCount: number;

  constructor(
    maxWorlds: number,
    dim: number,
    numDocs: number,
    historyDepth = 64,
    docVectors?: Float32Array
  ) {
    this.maxWorlds = maxWorlds;
    this.dim = dim;
    this.numDocs = numDocs;
    this.historyDepth = historyDepth;
    
    this.worlds = new Array(maxWorlds);
    this.active = new Uint8Array(maxWorlds);
    this.superposition = new Float32Array(maxWorlds);
    this.worldNames = new Array(maxWorlds);
    this.reconAcc = new Float32Array(dim);
    this.diffAcc = new Float32Array(dim);
    this.crossScores = new Float32Array(maxWorlds);
    this.queryMask = new Uint8Array(maxWorlds);
    this.queryCount = 0;
    
    // Pre-allocate semua world slot (tidak alloc di runtime)
    for (let w = 0; w < maxWorlds; w++) {
      this.worlds[w] = new HolographicMemoryField(dim, numDocs, historyDepth, docVectors);
      this.active[w] = 0;
      this.superposition[w] = 0;
      this.worldNames[w] = '';
    }
  }

  // === WORLD LIFECYCLE ===

  /** 
   * Initialize world 0 sebagai "trunk" / canonical reality.
   * Wajib dipanggil pertama kali.
   */
  initTrunk(docFHRR: Float32Array, docWeights: Float32Array, name = 'trunk'): void {
    this.active[0] = 1;
    this.superposition[0] = 1.0;
    this.worldNames[0] = name;
    this.worlds[0]!.encodeBatch(docFHRR, docWeights);
  }

  /**
   * Fork world: copy sourceWorld ke targetWorld.
   * Target harus inactive (slot kosong).
   * Copy menggunakan buffer copy (tidak alloc baru).
   */
  fork(sourceWorld: number, targetWorld: number, name: string): boolean {
    if (sourceWorld < 0 || sourceWorld >= this.maxWorlds) return false;
    if (targetWorld < 0 || targetWorld >= this.maxWorlds) return false;
    if (!this.active[sourceWorld] || this.active[targetWorld]) return false;
    
    const src = this.worlds[sourceWorld]!;
    const dst = this.worlds[targetWorld]!;
    
    // Deep copy semua moment (zero-alloc karena dst sudah pre-allocated)
    dst.firstMoment.set(src.firstMoment);
    dst.secondMoment.set(src.secondMoment);
    dst.docWeights.set(src.docWeights);
    
    let tw = 0;
    // eslint-disable-next-line @typescript-eslint/prefer-for-of
    for (let i = 0; i < dst.docWeights.length; i++) tw += dst.docWeights[i]!;
    dst.totalWeight = tw;
    
    dst.coherenceHistory.set(src.coherenceHistory);
    dst.entropyHistory.set(src.entropyHistory);
    dst.historyCursor = src.historyCursor;
    
    this.active[targetWorld] = 1;
    this.superposition[targetWorld] = this.superposition[sourceWorld]! * 0.95; // slightly less real
    this.worldNames[targetWorld] = name;
    
    return true;
  }

  /**
   * Recycle world slot (hapus branch yang sudah tidak perlu).
   * Zero-fill tapi tidak dealloc.
   */
  prune(world: number): boolean {
    if (world < 0 || world >= this.maxWorlds) return false;
    if (!this.active[world]) return false;
    
    const w = this.worlds[world]!;
    w.firstMoment.fill(0);
    w.secondMoment.fill(0);
    w.docWeights.fill(0);
    w.totalWeight = 0;
    w.coherenceHistory.fill(0);
    w.entropyHistory.fill(0);
    w.historyCursor = 0;
    
    this.active[world] = 0;
    this.superposition[world] = 0;
    this.worldNames[world] = '';
    return true;
  }

  /**
   * Collapse branch ke trunk: merge moment-nya, lalu prune.
   * Merge = weighted superposition dari docWeights.
   */
  collapse(branchWorld: number, trunkWorld = 0): boolean {
    if (branchWorld < 0 || branchWorld >= this.maxWorlds) return false;
    if (!this.active[branchWorld]) return false;
    if (!this.active[trunkWorld]) return false;
    
    const branch = this.worlds[branchWorld]!;
    const trunk = this.worlds[trunkWorld]!;
    const weight = this.superposition[branchWorld]!;
    
    // Merge: trunk += branch * weight
    const n = this.numDocs;
    for (let d = 0; d < n; d++) {
      if (branch.docWeights[d]! > 0) {
        const branchW = branch.docWeights[d]! * weight;
        const trunkW = trunk.docWeights[d]!;
        trunk.docWeights[d] = trunkW + branchW;
      }
    }
    
    // Rebuild trunk moments
    trunk.rebuildMoments();
    this.prune(branchWorld);
    return true;
  }

  // === SUPERPOSITION QUERY ===

  /**
   * Set query mask: world mana saja yang di-include.
   * Zero-allocation, hanya flag flip.
   */
  setQueryMask(worlds: number[]): void {
    this.queryMask.fill(0);
    this.queryCount = 0;
    for (const w of worlds) {
      if (w >= 0 && w < this.maxWorlds && this.active[w]) {
        this.queryMask[w] = 1;
        this.queryCount++;
      }
    }
  }

  /** Include semua active world */
  queryAll(): void {
    this.queryMask.fill(0);
    this.queryCount = 0;
    for (let w = 0; w < this.maxWorlds; w++) {
      if (this.active[w]) {
        this.queryMask[w] = 1;
        this.queryCount++;
      }
    }
  }

  /** 
   * Reconstruct dari weighted superposition semua world di mask.
   * 
   * recon = Σ_w (superposition[w] * world[w].reconstruct(query)) / Σ_w superposition[w]
   * 
   * Return: cross-world coherence (berapa "solid" realitasnya)
   */
  reconstructSuperposed(query: Float32Array, out: Float32Array): number {
    this.reconAcc.fill(0);
    let totalWeight = 0;
    let minCoherence = 1.0;
    
    // Accumulate weighted reconstructions
    for (let w = 0; w < this.maxWorlds; w++) {
      if (!this.queryMask[w]) continue;
      
      const world = this.worlds[w]!;
      const wWeight = this.superposition[w]!;
      if (wWeight < 1e-10) continue;
      
      const coh = world.reconstruct(query, world.tempVec);
      this.crossScores[w] = coh;
      if (coh < minCoherence) minCoherence = coh;
      
      // Accumulate: reconAcc += wWeight * tempVec
      const tv = world.tempVec;
      let i = 0;
      for (; i <= this.dim - 4; i += 4) {
        this.reconAcc[i]     += wWeight * tv[i]!;
        this.reconAcc[i + 1] += wWeight * tv[i + 1]!;
        this.reconAcc[i + 2] += wWeight * tv[i + 2]!;
        this.reconAcc[i + 3] += wWeight * tv[i + 3]!;
      }
      for (; i < this.dim; i++) this.reconAcc[i] += wWeight * tv[i]!;
      
      totalWeight += wWeight;
    }
    
    if (totalWeight < 1e-10) {
      out.fill(0);
      return 0;
    }
    
    const invW = 1.0 / totalWeight;
    let normSq = 0;
    for (let i = 0; i < this.dim; i++) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (out as any)[i] = this.reconAcc[i]! * invW;
      normSq += out[i]! * out[i]!;
    }
    
    const invNorm = normSq > 1e-10 ? 1.0 / Math.sqrt(normSq) : 0;
    for (let i = 0; i < this.dim; i++) out[i] = out[i]! * invNorm;
    
    let avgCoherence = 0;
    let count = 0;
    for (let w = 0; w < this.maxWorlds; w++) {
      if (this.queryMask[w]) {
        avgCoherence += this.crossScores[w]!;
        count++;
      }
    }
    avgCoherence = count > 0 ? avgCoherence / count : 0;
    
    return avgCoherence * minCoherence;
  }

  // === INTERFERENCE / DIFF ===

  /**
   * Diff antar dua world: residual field.
   * 
   * residual = reconA - reconB (normalized)
   * 
   * Gunakan untuk: deteksi kontradiksi lore, atau "glitch" di matrix.
   */
  diff(worldA: number, worldB: number, query: Float32Array, out: Float32Array): number {
    if (!this.active[worldA] || !this.active[worldB]) {
      out.fill(0);
      return 0;
    }
    
    const wA = this.worlds[worldA]!;
    const wB = this.worlds[worldB]!;
    
    const cohA = wA.reconstruct(query, this.reconAcc);
    const cohB = wB.reconstruct(query, this.diffAcc);
    
    let normSq = 0;
    for (let i = 0; i < this.dim; i++) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (out as any)[i] = this.reconAcc[i]! - this.diffAcc[i]!;
      normSq += out[i]! * out[i]!;
    }
    
    const invNorm = normSq > 1e-10 ? 1.0 / Math.sqrt(normSq) : 0;
    for (let i = 0; i < this.dim; i++) out[i] = out[i]! * invNorm;
    
    return Math.abs(cohA - cohB);
  }

  /**
   * Multi-world anomaly: cek apakah NPC state consistent di SEMUA world.
   * 
   * Return: world dengan coherence terendah (weakest link), dan suggestion.
   */
  validateCrossWorld(npcVec: Float32Array): {
    consistent: boolean;
    weakestWorld: number;
    weakestName: string;
    minCoherence: number;
    avgCoherence: number;
    action: 'allow' | 'warn' | 'retcon';
  } {
    let minCoh = 1.0;
    let minWorld = -1;
    let sumCoh = 0;
    let count = 0;
    
    for (let w = 0; w < this.maxWorlds; w++) {
      if (!this.active[w]) continue;
      
      const coh = this.worlds[w]!.reconstruct(npcVec, this.reconAcc);
      sumCoh += coh;
      count++;
      
      if (coh < minCoh) {
        minCoh = coh;
        minWorld = w;
      }
    }
    
    const avgCoh = count > 0 ? sumCoh / count : 0;
    let action: 'allow' | 'warn' | 'retcon';
    
    if (minCoh > 0.5 && avgCoh > 0.6) {
      action = 'allow';
    } else if (minCoh > 0.3) {
      action = 'warn';
    } else {
      action = 'retcon';
    }
    
    return {
      consistent: minCoh > 0.5,
      weakestWorld: minWorld,
      weakestName: minWorld >= 0 ? this.worldNames[minWorld]! : '',
      minCoherence: minCoh,
      avgCoherence: avgCoh,
      action
    };
  }

  // === EPISTEMIC MULTI-WORLD ===

  /**
   * Epistemic query: retrieve dari superposition, tapi dengan uncertainty aware.
   * 
   * Jika cross-world coherence rendah → realitas "fractured", butuh LLM atau player choice.
   */
  epistemicQuery(
    query: Float32Array,
    outRecon: Float32Array
  ): {
    coherence: number;
    fractured: boolean;
    worldBreakdown: { world: number; name: string; coherence: number; weight: number }[];
    recommendation: string;
  } {
    const coh = this.reconstructSuperposed(query, outRecon);
    const breakdown: { world: number; name: string; coherence: number; weight: number }[] = [];
    
    let variance = 0;
    let count = 0;
    let avg = 0;
    
    for (let w = 0; w < this.maxWorlds; w++) {
      if (!this.queryMask[w]) continue;
      breakdown.push({
        world: w,
        name: this.worldNames[w]!,
        coherence: this.crossScores[w]!,
        weight: this.superposition[w]!
      });
      avg += this.crossScores[w]!;
      count++;
    }
    
    avg = count > 0 ? avg / count : 0;
    for (const b of breakdown) variance += (b.coherence - avg) * (b.coherence - avg);
    variance = count > 0 ? variance / count : 0;
    
    const fractured = variance > 0.05 || coh < 0.4;
    
    let recommendation: string;
    if (fractured) {
      recommendation = `Reality fracture detected across ${count} worlds (variance ${variance.toFixed(3)}). Player choice or LLM arbitration required.`;
    } else if (coh < 0.5) {
      recommendation = `Low consensus coherence (${coh.toFixed(2)}). Query may be novel or contradictory to all active lore branches.`;
    } else {
      recommendation = `Strong consensus (${coh.toFixed(2)}). Kernel retrieval sufficient.`;
    }
    
    return { coherence: coh, fractured, worldBreakdown: breakdown, recommendation };
  }

  // === TIME-TRAVEL / FLASHBACK ===

  /**
   * Set superposition weights untuk efek temporal:
   * - Past: weight tinggi di world lama, rendah di trunk
   * - Present: weight 1.0 di trunk, 0 di lainnya
   * - Paradox: equal weights (interference maksimum)
   */
  setTemporalFocus(presentWorld: number, pastWorld: number, pastStrength: number): void {
    for (let w = 0; w < this.maxWorlds; w++) {
      if (!this.active[w]) continue;
      if (w === presentWorld) {
        this.superposition[w] = 1.0;
      } else if (w === pastWorld) {
        this.superposition[w] = pastStrength;
      } else {
        this.superposition[w] = 0.0;
      }
    }
  }

  /**
   * Create paradox state: equal superposition semua active world.
   * Hasil: interference pattern, reality "unstable".
   */
  induceParadox(): void {
    let activeCount = 0;
    for (let w = 0; w < this.maxWorlds; w++) if (this.active[w]) activeCount++;
    const weightVal = activeCount > 0 ? 1.0 / activeCount : 0;
    for (let w = 0; w < this.maxWorlds; w++) {
      if (this.active[w]) this.superposition[w] = weightVal;
    }
  }

  // === STATS ===
  getWorldStats(): { id: number; name: string; active: boolean; weight: number; docs: number; coherence: number }[] {
    const out = [];
    for (let w = 0; w < this.maxWorlds; w++) {
      if (!this.active[w]) continue;
      const stats = this.worlds[w]!.getMemoryStats();
      out.push({
        id: w,
        name: this.worldNames[w]!,
        active: true,
        weight: this.superposition[w]!,
        docs: stats.activeDocs,
        coherence: stats.rollingCoherence
      });
    }
    return out;
  }
}
