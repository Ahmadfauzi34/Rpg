/**
 * Holographic Associative Memory Field — Real Domain
 *
 * Simulasi FHRR di real domain menggunakan first & second moment.
 * Bukan Hopfield (capacity terbatas), tapi Gaussian Moment Field:
 * - First moment  = mean vector (global "vibe" dunia)
 * - Second moment = covariance (relational structure antar konsep)
 *
 * Retrieval = reconstruction via covariance projection + coherence check.
 * Uncertainty = entropy dari interference pattern.
 *
 * Zero-allocation query path. SOA flat.
 */
export class HolographicMemoryField {
  readonly dim: number;
  readonly numDocs: number;
  readonly historyDepth: number;

  // === MEMORY MOMENTS ===
  readonly firstMoment: Float32Array; // [dim] — Σ w_i v_i
  readonly secondMoment: Float32Array; // [dim * dim] — Σ w_i v_i v_i^T (row-major)
  readonly docWeights: Float32Array; // [numDocs] — weights per doc
  totalWeight: number;

  // === EPISTEMIC TRACKING ===
  readonly coherenceHistory: Float32Array; // [historyDepth]
  readonly entropyHistory: Float32Array; // [historyDepth]
  historyCursor: number;

  // === PRE-ALLOCATED WORKSPACE ===
  readonly recon: Float32Array; // [dim] — reconstructed vector
  readonly grad: Float32Array; // [dim] — expansion gradient
  readonly tempScores: Float32Array; // [numDocs] — scratch untuk entropy
  readonly tempVec: Float32Array; // [dim] — general scratch

  // === EPISODIC TRACKING ===
  readonly docVectors: Float32Array | null = null;
  readonly rehearsed: Uint8Array;
  readonly salience: Float32Array;
  readonly decayTemp: Float32Array;
  private _lazyTickCounter = 0;

  // === THRESHOLDS (tuneable) ===
  coherenceThreshold: number; // min coherence untuk "confident"
  entropyThreshold: number; // max entropy untuk "confident"
  noveltyBoost: number; // weight untuk dokumen baru (recency)

  constructor(
    dim: number,
    numDocs: number,
    historyDepth = 64,
    docVectors?: Float32Array,
  ) {
    this.dim = dim;
    this.numDocs = numDocs;
    this.historyDepth = historyDepth;

    if (docVectors) {
      if (docVectors.length !== numDocs * dim) {
        throw new Error("docVectors length mismatch");
      }
      this.docVectors = docVectors;
    }

    this.firstMoment = new Float32Array(dim);
    this.secondMoment = new Float32Array(dim * dim);
    this.docWeights = new Float32Array(numDocs);
    this.totalWeight = 0;

    this.coherenceHistory = new Float32Array(historyDepth);
    this.entropyHistory = new Float32Array(historyDepth);
    this.historyCursor = 0;

    this.recon = new Float32Array(dim);
    this.grad = new Float32Array(dim);
    this.tempScores = new Float32Array(numDocs);
    this.tempVec = new Float32Array(dim);
    this.decayTemp = new Float32Array(dim);

    this.rehearsed = new Uint8Array(numDocs);
    this.salience = new Float32Array(numDocs);
    this.salience.fill(1.0);

    this.coherenceThreshold = 0.35;
    this.entropyThreshold = 0.75;
    this.noveltyBoost = 1.0;
  }

  // === ENCODE: Bind dokumen ke memory field ===
  // Bisa dipanggil incremental (update weight) atau batch

  encode(docId: number, vec: Float32Array, weight: number): void {
    if (docId < 0 || docId >= this.numDocs) return;

    const oldW = this.docWeights[docId]!;
    const delta = weight - oldW;
    if (Math.abs(delta) < 1e-10) return;

    const { dim, firstMoment, secondMoment } = this;

    // Update first moment: μ += δ·v
    let i = 0;
    for (; i <= dim - 4; i += 4) {
      firstMoment[i] += delta * vec[i]!;
      firstMoment[i + 1] += delta * vec[i + 1]!;
      firstMoment[i + 2] += delta * vec[i + 2]!;
      firstMoment[i + 3] += delta * vec[i + 3]!;
    }
    for (; i < dim; i++) firstMoment[i] += delta * vec[i]!;

    // Update second moment: Σ += δ·(v ⊗ v)
    // Blocked untuk cache efficiency
    const BLOCK = 32;
    for (let ii = 0; ii < dim; ii += BLOCK) {
      const iMax = Math.min(ii + BLOCK, dim);
      for (let jj = 0; jj < dim; jj += BLOCK) {
        const jMax = Math.min(jj + BLOCK, dim);
        for (let r = ii; r < iMax; r++) {
          const vr = vec[r]! * delta;
          const rowOff = r * dim;
          for (let c = jj; c < jMax; c++) {
            secondMoment[rowOff + c] += vr * vec[c]!;
          }
        }
      }
    }

    this.docWeights[docId] = weight;
    this.totalWeight += delta;
  }

  /** Batch encode untuk init cepat */
  encodeBatch(docs: Float32Array, weights: Float32Array): void {
    for (let d = 0; d < this.numDocs; d++) {
      this.encode(
        d,
        docs.subarray(d * this.dim, (d + 1) * this.dim),
        weights[d]!,
      );
    }
  }

  // === RECONSTRUCT: Pattern completion dari query ===
  // recon = (1/W) · Σ · query  →  expected vector di memory field
  // Return: coherence = cosine(recon, query)

  reconstruct(query: Float32Array, out: Float32Array): number {
    const { dim, secondMoment, totalWeight } = this;

    if (totalWeight < 1e-10) {
      out.fill(0);
      return 0;
    }

    const invW = 1.0 / totalWeight;

    // Matrix-vector: out = secondMoment · query · invW
    // Unrolled inner, blocked outer
    const BLOCK = 32;
    for (let ii = 0; ii < dim; ii += BLOCK) {
      const iMax = Math.min(ii + BLOCK, dim);
      for (let i = ii; i < iMax; i++) {
        let sum = 0;
        const rowOff = i * dim;
        let j = 0;
        for (; j <= dim - 4; j += 4) {
          sum += secondMoment[rowOff + j]! * query[j]!;
          sum += secondMoment[rowOff + j + 1]! * query[j + 1]!;
          sum += secondMoment[rowOff + j + 2]! * query[j + 2]!;
          sum += secondMoment[rowOff + j + 3]! * query[j + 3]!;
        }
        for (; j < dim; j++) sum += secondMoment[rowOff + j]! * query[j]!;
        out[i] = sum * invW;
      }
    }

    // Normalize + coherence
    let normSq = 0,
      dot = 0;
    let i = 0;
    for (; i <= dim - 4; i += 4) {
      normSq +=
        out[i]! * out[i]! +
        out[i + 1]! * out[i + 1]! +
        out[i + 2]! * out[i + 2]! +
        out[i + 3]! * out[i + 3]!;
      dot +=
        out[i]! * query[i]! +
        out[i + 1]! * query[i + 1]! +
        out[i + 2]! * query[i + 2]! +
        out[i + 3]! * query[i + 3]!;
    }
    for (; i < dim; i++) {
      normSq += out[i]! * out[i]!;
      dot += out[i]! * query[i]!;
    }

    const invNorm = normSq > 1e-10 ? 1.0 / Math.sqrt(normSq) : 0;
    for (let j = 0; j < dim; j++) out[j]! *= invNorm;

    return dot * invNorm; // cosine similarity
  }

  // === EPISTEMIC UNCERTAINTY: Entropy & Gini dari candidate scores ===

  measureUncertainty(
    scores: Float32Array,
    count: number,
  ): { entropy: number; gini: number; coherence: number; confident: boolean } {
    if (count <= 1) {
      return { entropy: 1.0, gini: 1.0, coherence: 0, confident: false };
    }

    // Normalize ke probability
    let sum = 0;
    for (let i = 0; i < count; i++) sum += scores[i]!;
    const invSum = sum > 1e-10 ? 1.0 / sum : 0;

    // Entropy: H = -Σ p·log(p)
    let entropy = 0;
    for (let i = 0; i < count; i++) {
      const p = scores[i]! * invSum;
      if (p > 1e-10) entropy -= p * Math.log(p);
    }
    const logK = Math.log(count);
    const normEntropy = logK > 1e-10 ? entropy / logK : 0;

    // Gini: concentration measure (0 = flat, 1 = peaked), O(n log n) optimized
    let giniNum = 0;

    // Gunakan pre-allocated array (tempScores) max `numDocs`
    let sortedScores: Float32Array;
    if (count <= this.numDocs) {
      sortedScores = this.tempScores.slice(0, count);
    } else {
      sortedScores = new Float32Array(count); // Fallback
    }

    for (let i = 0; i < count; i++) sortedScores[i] = scores[i]!;
    sortedScores.sort();
    for (let i = 0; i < count; i++) {
      giniNum += (2 * i - count + 1) * sortedScores[i]!;
    }
    const gini = sum > 1e-10 ? giniNum / (count * sum) : 0;

    // Coherence = 1 - entropy (high coherence = low entropy)
    const coherence = 1.0 - normEntropy;

    // Update rolling history
    const h = this.historyCursor % this.historyDepth;
    this.coherenceHistory[h] = coherence;
    this.entropyHistory[h] = normEntropy;
    this.historyCursor++;

    const confident =
      normEntropy < this.entropyThreshold &&
      coherence > this.coherenceThreshold;

    return { entropy: normEntropy, gini, coherence, confident };
  }

  // === QUERY EXPANSION GRADIENT ===
  // Jika query tidak coherent, arahkan ke arah mana dia harus "grow"
  // grad = recon - query  (arah yang paling coherent dengan memory)

  expansionGradient(query: Float32Array, out: Float32Array): number {
    const coherence = this.reconstruct(query, this.recon);

    // grad = recon - query (direction of maximum coherence increase)
    for (let i = 0; i < this.dim; i++) {
      out[i] = this.recon[i]! - query[i]!;
    }

    // Normalize
    let norm = 0;
    for (let i = 0; i < this.dim; i++) norm += out[i]! * out[i]!;
    const invNorm = norm > 1e-10 ? 1.0 / Math.sqrt(norm) : 0;
    for (let i = 0; i < this.dim; i++) out[i]! *= invNorm;

    return coherence;
  }

  // === ANOMALY DETECTION: Cek apakah state/vector anomalous ===
  // Integrasi langsung dengan TopologicalSyncSystem

  checkAnomaly(stateVector: Float32Array): {
    isAnomaly: boolean;
    coherence: number;
    severity: "none" | "mild" | "critical";
    suggestion: string;
  } {
    const coherence = this.reconstruct(stateVector, this.recon);

    if (coherence > 0.65) {
      return {
        isAnomaly: false,
        coherence,
        severity: "none",
        suggestion: "Coherent with world memory",
      };
    } else if (coherence > 0.35) {
      return {
        isAnomaly: false,
        coherence,
        severity: "mild",
        suggestion: "Novel state, monitor for divergence",
      };
    } else {
      // Critical: state contradicts established lore
      // Hitung arah koreksi
      this.expansionGradient(stateVector, this.grad);

      return {
        isAnomaly: true,
        coherence,
        severity: "critical",
        suggestion:
          "State anomalous: contradicts holographic memory field. Consider lore correction or retcon.",
      };
    }
  }

  // === ROLLING STATS ===

  getRollingCoherence(): number {
    const n = Math.min(this.historyCursor, this.historyDepth);
    if (n === 0) return 0;
    let sum = 0;
    for (let i = 0; i < n; i++) sum += this.coherenceHistory[i]!;
    return sum / n;
  }

  getRollingEntropy(): number {
    const n = Math.min(this.historyCursor, this.historyDepth);
    if (n === 0) return 1;
    let sum = 0;
    for (let i = 0; i < n; i++) sum += this.entropyHistory[i]!;
    return sum / n;
  }

  // === MEMORY DECAY (untuk episodic forgetting) ===
  // Simulate memory fade: multiply all weights by decay factor

  markRehearsed(docId: number): void {
    if (docId >= 0 && docId < this.numDocs) {
      this.rehearsed[docId] = 1;
    }
  }

  setSalience(docId: number, value: number): void {
    if (docId >= 0 && docId < this.numDocs) {
      this.salience[docId] = Math.max(0.1, value);
    }
  }

  setSalienceBatch(docIds: Int32Array, values: Float32Array): void {
    const n = Math.min(docIds.length, values.length);
    for (let i = 0; i < n; i++) {
      const d = docIds[i]!;
      if (d >= 0 && d < this.numDocs)
        this.salience[d] = Math.max(0.1, values[i]!);
    }
  }

  scheduleDecay(
    baseDecay: number,
    mode: "incremental" | "lazy" = "lazy",
    lazyRebuildInterval = 10,
  ): void {
    if (baseDecay <= 0 || baseDecay >= 1) return;

    const { numDocs, salience, rehearsed, docWeights } = this;

    // Phase 1: Update weights only (O(numDocs))
    let newTotalWeight = 0;
    for (let d = 0; d < numDocs; d++) {
      const oldW = docWeights[d]!;
      if (oldW <= 1e-10) continue;

      const s = salience[d]!;
      const r = rehearsed[d] ? 1.05 : 1.0;
      const factor = Math.pow(baseDecay, 1.0 / s) * r;
      const newW = oldW * factor;

      if (newW > 1e-6) {
        docWeights[d] = newW;
        newTotalWeight += newW;
      } else {
        docWeights[d] = 0;
      }
    }
    this.totalWeight = newTotalWeight;

    // Clear rehearsal flags
    rehearsed.fill(0);

    // Phase 2: Rebuild moments
    if (mode === "incremental") {
      if (!this.docVectors) {
        throw new Error("docVectors required for incremental decay");
      }
      this._incrementalRebuild();
    } else {
      // Lazy mode: track counter, rebuild setiap N tick
      this._lazyTickCounter = (this._lazyTickCounter + 1) % lazyRebuildInterval;
      if (this._lazyTickCounter === 0) {
        this.rebuildMoments();
      }
    }
  }

  private _incrementalRebuild(): void {
    if (!this.docVectors) return;

    const { numDocs, dim, docVectors, docWeights, decayTemp } = this;

    // Reset moments dulu (karena encode menambah, bukan replace)
    this.firstMoment.fill(0);
    this.secondMoment.fill(0);
    this.totalWeight = 0;

    for (let d = 0; d < numDocs; d++) {
      const w = docWeights[d]!;
      if (w <= 1e-10) continue;

      const dOff = d * dim;
      for (let j = 0; j < dim; j++) decayTemp[j] = docVectors[dOff + j]!;
      this.encode(d, decayTemp, w);
    }
  }

  rebuildMoments(): void {
    if (!this.docVectors) return;

    const { dim, numDocs, docVectors, docWeights } = this;
    this.firstMoment.fill(0);
    this.secondMoment.fill(0);
    this.totalWeight = 0;

    for (let d = 0; d < numDocs; d++) {
      const w = docWeights[d]!;
      if (w <= 1e-10) continue;

      const dOff = d * dim;

      for (let j = 0; j < dim; j++) {
        this.firstMoment[j] += w * docVectors[dOff + j]!;
      }

      const BLOCK = 32;
      for (let ii = 0; ii < dim; ii += BLOCK) {
        const iMax = Math.min(ii + BLOCK, dim);
        for (let jj = 0; jj < dim; jj += BLOCK) {
          const jMax = Math.min(jj + BLOCK, dim);
          for (let r = ii; r < iMax; r++) {
            const vr = docVectors[dOff + r]! * w;
            const rowOff = r * dim;
            for (let c = jj; c < jMax; c++) {
              this.secondMoment[rowOff + c] += vr * docVectors[dOff + c]!;
            }
          }
        }
      }

      this.totalWeight += w;
    }
  }

  getEpisodicStats(): {
    activeDocs: number;
    totalWeight: number;
    rehearsedLastTick: number;
    meanSalience: number;
    fadedCount: number;
  } {
    let active = 0,
      faded = 0,
      wSum = 0,
      sSum = 0;
    for (let i = 0; i < this.numDocs; i++) {
      if (this.docWeights[i]! > 1e-10) {
        active++;
        wSum += this.docWeights[i]!;
        sSum += this.salience[i]!;
      } else {
        faded++;
      }
    }
    let rehearsedCount = 0;
    for (let i = 0; i < this.numDocs; i++)
      if (this.rehearsed[i]) rehearsedCount++;

    return {
      activeDocs: active,
      totalWeight: wSum,
      rehearsedLastTick: rehearsedCount,
      meanSalience: active > 0 ? sSum / active : 0,
      fadedCount: faded,
    };
  }

  // === DEBUG ===
  getMemoryStats(): {
    totalWeight: number;
    meanWeight: number;
    activeDocs: number;
    rollingCoherence: number;
    rollingEntropy: number;
  } {
    let active = 0,
      wSum = 0;
    for (let i = 0; i < this.numDocs; i++) {
      if (this.docWeights[i]! > 1e-10) active++;
      wSum += this.docWeights[i]!;
    }
    return {
      totalWeight: this.totalWeight,
      meanWeight: active > 0 ? wSum / active : 0,
      activeDocs: active,
      rollingCoherence: this.getRollingCoherence(),
      rollingEntropy: this.getRollingEntropy(),
    };
  }
}

// === EPISTEMIC RETRIEVAL KERNEL ===
// Wrapper yang menggabungkan RetrievalPipeline + HolographicMemoryField
// Decision logic: retrieve → measure uncertainty → decide LLM or not

export interface RetrievalDecision {
  chunks: { index: number; score: number; text?: string }[];
  confidence: number;
  useLLM: boolean;
  reason: string;
  expansionVector?: Float32Array; // untuk query expansion jika uncertain
}

export class EpistemicRetrievalKernel {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly pipeline: any; // RetrievalPipeline (dari hybrid-pipeline.ts)
  readonly hologram: HolographicMemoryField;
  readonly dim: number;

  // Pre-allocated
  readonly outIndices: Int32Array;
  readonly outScores: Float32Array;
  readonly qTerms: Int32Array;
  readonly qIDF: Float32Array;
  readonly qFHRR: Float32Array;

  constructor(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pipeline: any, // RetrievalPipeline instance
    hologram: HolographicMemoryField,
    dim: number,
    kFinal = 10,
  ) {
    this.pipeline = pipeline;
    this.hologram = hologram;
    this.dim = dim;
    this.outIndices = new Int32Array(kFinal);
    this.outScores = new Float32Array(kFinal);
    this.qTerms = new Int32Array(64);
    this.qIDF = new Float32Array(64);
    this.qFHRR = new Float32Array(dim);
  }

  /**
   * Smart Retrieve:
   * 1. Check query coherence dengan holographic field
   * 2. Jika incoherent → suggest expansion, tetap retrieve tapi flag low confidence
   * 3. Retrieve via pipeline
   * 4. Measure uncertainty dari candidate distribution
   * 5. Decide: confident → return chunks | uncertain → flag useLLM = true
   */
  retrieve(
    qTerms: Int32Array,
    qIDF: Float32Array,
    queryFHRR: Float32Array,
    nq = 32,
  ): RetrievalDecision {
    nq = Math.min(nq, qTerms.length, qIDF.length);
    for (let i = 0; i < nq; i++) {
      this.qTerms[i] = qTerms[i]!;
      this.qIDF[i] = qIDF[i]!;
    }
    this.qFHRR.set(queryFHRR);

    // 1. Pre-check: apakah query itu sendiri coherent dengan world memory?
    const preCoherence = this.hologram.reconstruct(
      queryFHRR,
      this.hologram.tempVec,
    );

    // 2. Retrieve via pipeline
    this.pipeline.query(
      this.qTerms.subarray(0, nq),
      this.qIDF.subarray(0, nq),
      this.qFHRR,
      nq,
      this.outIndices,
      this.outScores,
      { expand: preCoherence < 0.4, wBm25: 0.6, wSim: 0.4 },
    );

    // 3. Measure epistemic uncertainty dari hasil
    let validCount = 0;
    while (validCount < this.outIndices.length && this.outScores[validCount] !== -Infinity) {
      validCount++;
    }
    
    const uncertainty = this.hologram.measureUncertainty(
      this.outScores.subarray(0, validCount),
      validCount,
    );

    // 4. Build decision
    const chunks: RetrievalDecision["chunks"] = [];
    for (let i = 0; i < this.outIndices.length; i++) {
      if (this.outScores[i] === -Infinity) break;
      chunks.push({ index: this.outIndices[i]!, score: this.outScores[i]! });
    }

    let decision: RetrievalDecision;

    if (uncertainty.confident && preCoherence > 0.3) {
      // Kernel cukup cerdas untuk jawab sendiri
      decision = {
        chunks,
        confidence: uncertainty.coherence,
        useLLM: false,
        reason: `High coherence (${uncertainty.coherence.toFixed(2)}), low entropy (${uncertainty.entropy.toFixed(2)}). Kernel retrieval sufficient.`,
      };
    } else if (uncertainty.confident && preCoherence <= 0.3) {
      // Retrieved, tapi query asli anomalous — butuh LLM untuk interpretasi kreatif
      decision = {
        chunks,
        confidence: uncertainty.coherence * 0.7,
        useLLM: true,
        reason: `Retrieval confident but query is novel/anomalous (coherence ${preCoherence.toFixed(2)}). LLM needed for creative interpolation.`,
      };
    } else {
      // Uncertain — butuh expansion atau LLM
      const grad = new Float32Array(this.dim);
      this.hologram.expansionGradient(queryFHRR, grad);

      decision = {
        chunks,
        confidence: uncertainty.coherence,
        useLLM: true,
        reason: `High entropy (${uncertainty.entropy.toFixed(2)}) — retrieval ambiguous. Suggest query expansion or LLM reasoning.`,
        expansionVector: grad,
      };
    }

    return decision;
  }

  /**
   * NPC State Validation — integrasi dengan TopologicalSyncSystem
   * Cek apakah state vector NPC coherent dengan world lore
   */
  validateNPCState(npcStateVector: Float32Array): {
    valid: boolean;
    coherence: number;
    action: "allow" | "warn" | "block" | "retcon";
    suggestion: string;
  } {
    const anomaly = this.hologram.checkAnomaly(npcStateVector);

    if (!anomaly.isAnomaly) {
      return {
        valid: true,
        coherence: anomaly.coherence,
        action: "allow",
        suggestion: anomaly.suggestion,
      };
    }

    // Anomaly detected
    const rolling = this.hologram.getRollingCoherence();
    const action =
      anomaly.severity === "critical" && rolling < 0.4
        ? "retcon"
        : anomaly.severity === "critical"
          ? "block"
          : "warn";

    return {
      valid: false,
      coherence: anomaly.coherence,
      action,
      suggestion: anomaly.suggestion,
    };
  }
}
