export class HybridCSRMatrix {
  readonly rows: number;
  readonly cols: number;
  readonly data: number; // Length of data/colIdx
  readonly values: Float32Array;
  readonly colIdx: Int32Array;
  readonly rowPtr: Int32Array;

  constructor(rows: number, cols: number, data: number) {
    this.rows = rows;
    this.cols = cols;
    this.data = data;
    this.values = new Float32Array(data);
    this.colIdx = new Int32Array(data);
    this.rowPtr = new Int32Array(rows + 1);
  }
}

// === POPCOUNT LUT ===
const POPCOUNT_LUT = new Uint8Array(256);
for (let i = 0; i < 256; i++) {
  let c = 0,
    n = i;
  while (n) {
    c++;
    n &= n - 1;
  }
  POPCOUNT_LUT[i] = c;
}

export function popcount32(x: number): number {
  return (
    POPCOUNT_LUT[x & 0xff]! +
    POPCOUNT_LUT[(x >>> 8) & 0xff]! +
    POPCOUNT_LUT[(x >>> 16) & 0xff]! +
    POPCOUNT_LUT[(x >>> 24) & 0xff]!
  );
}

// === INLINE TOP-K (Zero-allocation, pre-allocated slots) ===
function topkInsert(
  k: number,
  indices: Int32Array,
  scores: Float32Array,
  minScoreRef: { v: number },
  idx: number,
  score: number,
): void {
  if (score <= minScoreRef.v) return;
  let i = k - 1;
  while (i > 0 && score > scores[i - 1]!) {
    scores[i] = scores[i - 1]!;
    indices[i] = indices[i - 1]!;
    i--;
  }
  scores[i] = score;
  indices[i] = idx;
  minScoreRef.v = scores[k - 1]!;
}

function topkReset(
  k: number,
  indices: Int32Array,
  scores: Float32Array,
  minRef: { v: number },
): void {
  scores.fill(-Infinity);
  indices.fill(-1);
  minRef.v = -Infinity;
}

// === MAIN PIPELINE ===
export class RetrievalPipeline {
  readonly numTerms: number;
  readonly numDocs: number;
  readonly dim: number;
  readonly numBits: number;
  readonly words: number;
  readonly maxQueryTerms: number;
  readonly kBm25: number;
  readonly kFinal: number;

  invLists: HybridCSRMatrix;
  readonly termUB: Float32Array;
  cooccur: HybridCSRMatrix;
  fingerprints: Uint32Array;
  readonly projection: Float32Array;

  readonly wandCursors: Int32Array;
  readonly wandDocIDs: Int32Array;
  readonly wandOrder: Int32Array;

  readonly expandScores: Float32Array;
  readonly expandTemp: Float32Array;
  readonly expandVisited: Uint8Array;

  readonly queryHash: Uint32Array;

  readonly bm25Idx: Int32Array;
  readonly bm25Scr: Float32Array;
  readonly bm25Min: { v: number };

  readonly simIdx: Int32Array;
  readonly simScr: Float32Array;
  readonly simMin: { v: number };

  readonly finalIdx: Int32Array;
  readonly finalScr: Float32Array;
  readonly finalMin: { v: number };

  readonly candMask: Uint8Array;
  readonly expTermsBuf: Int32Array;
  readonly expWeightsBuf: Float32Array;

  constructor(
    numTerms: number,
    numDocs: number,
    dim: number,
    numBits: number,
    maxQueryTerms: number,
    kBm25 = 200,
    kFinal = 10,
  ) {
    this.numTerms = numTerms;
    this.numDocs = numDocs;
    this.dim = dim;
    this.numBits = numBits;
    this.words = (Math.ceil(numBits / 32)) | 0;
    this.maxQueryTerms = maxQueryTerms;
    this.kBm25 = kBm25;
    this.kFinal = kFinal;

    this.invLists = new HybridCSRMatrix(0, 0, 0);
    this.termUB = new Float32Array(numTerms);
    this.cooccur = new HybridCSRMatrix(0, 0, 0);
    this.fingerprints = new Uint32Array(0);
    this.projection = new Float32Array(numBits * dim);

    this.wandCursors = new Int32Array(maxQueryTerms);
    this.wandDocIDs = new Int32Array(maxQueryTerms);
    this.wandOrder = new Int32Array(maxQueryTerms);

    this.expandScores = new Float32Array(numTerms);
    this.expandTemp = new Float32Array(numTerms);
    this.expandVisited = new Uint8Array(numTerms);

    this.queryHash = new Uint32Array(this.words);

    this.bm25Idx = new Int32Array(kBm25);
    this.bm25Scr = new Float32Array(kBm25);
    this.bm25Min = { v: -Infinity };

    this.simIdx = new Int32Array(kBm25);
    this.simScr = new Float32Array(kBm25);
    this.simMin = { v: -Infinity };

    this.finalIdx = new Int32Array(kFinal);
    this.finalScr = new Float32Array(kFinal);
    this.finalMin = { v: -Infinity };

    this.candMask = new Uint8Array(numDocs);
    this.expTermsBuf = new Int32Array(64);
    this.expWeightsBuf = new Float32Array(64);
  }

  build(
    invLists: HybridCSRMatrix,
    termUB: Float32Array,
    cooccur: HybridCSRMatrix,
    docFHRR: Float32Array,
    projection?: Float32Array,
  ): void {
    this.invLists = invLists;
    this.termUB.fill(0);
    this.termUB.set(termUB.subarray(0, this.numTerms));
    this.cooccur = cooccur;

    if (projection) {
      this.projection.set(projection);
    } else {
      for (let i = 0; i < this.numBits * this.dim; i++) {
        this.projection[i] = ((i * 2654435761) & 1) === 0 ? -1 : 1;
      }
    }

    const fpSize = this.numDocs * this.words;
    this.fingerprints = new Uint32Array(fpSize);

    for (let d = 0; d < this.numDocs; d++) {
      const dOff = d * this.dim;
      const hOff = d * this.words;
      for (let b = 0; b < this.numBits; b++) {
        let dot = 0;
        const pOff = b * this.dim;
        let j = 0;
        for (; j <= this.dim - 4; j += 4) {
          dot += docFHRR[dOff + j]! * this.projection[pOff + j]!;
          dot += docFHRR[dOff + j + 1]! * this.projection[pOff + j + 1]!;
          dot += docFHRR[dOff + j + 2]! * this.projection[pOff + j + 2]!;
          dot += docFHRR[dOff + j + 3]! * this.projection[pOff + j + 3]!;
        }
        for (; j < this.dim; j++) {
          dot += docFHRR[dOff + j]! * this.projection[pOff + j]!;
        }
        if (dot > 0) {
          this.fingerprints[hOff + (b >> 5)] |= 1 << (b & 31);
        }
      }
    }
  }

  private wandSearch(
    qTerms: Int32Array,
    qIDF: Float32Array,
    nq: number,
  ): number {
    topkReset(this.kBm25, this.bm25Idx, this.bm25Scr, this.bm25Min);
    const { invLists, termUB, wandCursors, wandDocIDs, wandOrder } = this;
    const k = this.kBm25;
    let threshold = 0;

    for (let i = 0; i < nq; i++) {
      const t = qTerms[i]!;
      if (t < 0 || t >= this.numTerms) {
        wandCursors[i] = 0;
        wandDocIDs[i] = 2147483647;
        wandOrder[i] = i;
        continue;
      }
      wandCursors[i] = invLists.rowPtr[t]!;
      const end = invLists.rowPtr[t + 1]!;
      wandDocIDs[i] =
        wandCursors[i] < end ? invLists.colIdx[wandCursors[i]!]! : 2147483647;
      wandOrder[i] = i;
    }

    while (true) {
      for (let i = 1; i < nq; i++) {
        const key = wandOrder[i]!;
        const keyDoc = wandDocIDs[key]!;
        let j = i - 1;
        while (j >= 0 && wandDocIDs[wandOrder[j]!]! > keyDoc) {
          wandOrder[j + 1] = wandOrder[j]!;
          j--;
        }
        wandOrder[j + 1] = key;
      }

      let sumUB = 0;
      let pivotPos = -1;
      for (let i = 0; i < nq; i++) {
        const t = qTerms[wandOrder[i]!]!;
        if (t < 0 || t >= this.numTerms) {
          // Invalid term contributes 0 to upper bound
          continue;
        }
        sumUB += termUB[t]! * qIDF[wandOrder[i]!]!;
        if (sumUB > threshold) {
          pivotPos = i;
          break;
        }
      }

      if (pivotPos < 0) break;
      const pivotTerm = wandOrder[pivotPos]!;
      const pivotDoc = wandDocIDs[pivotTerm]!;
      if (pivotDoc === 2147483647) break;

      let match = true;
      for (let i = 0; i < pivotPos; i++) {
        if (wandDocIDs[wandOrder[i]!]! !== pivotDoc) {
          match = false;
          break;
        }
      }

      if (match) {
        let score = 0;
        for (let i = 0; i < nq; i++) {
          const t = qTerms[i]!;
          if (t < 0 || t >= this.numTerms) {
            wandDocIDs[i] = 2147483647; // Mark as exhausted
            continue;
          }
          const end = invLists.rowPtr[t + 1]!;
          let p = wandCursors[i]!;
          for (; p < end && invLists.colIdx[p]! < pivotDoc; p++) {
            // fast-forward
          }
          if (p < end && invLists.colIdx[p] === pivotDoc) {
            score += invLists.values[p]! * qIDF[i]!;
            wandCursors[i] = p + 1;
          } else {
            wandCursors[i] = p;
          }
          wandDocIDs[i] =
            wandCursors[i] < end
              ? invLists.colIdx[wandCursors[i]!]!
              : 2147483647;
        }
        topkInsert(
          k,
          this.bm25Idx,
          this.bm25Scr,
          this.bm25Min,
          pivotDoc,
          score,
        );
        if (this.bm25Scr[k - 1]! > threshold) threshold = this.bm25Scr[k - 1]!;
      } else {
        const skipTerm = wandOrder[0]!;
        const t = qTerms[skipTerm]!;
        if (t < 0 || t >= this.numTerms) {
          // Invalid term: mark as exhausted to prevent infinite loop
          wandCursors[skipTerm] = 0;
          wandDocIDs[skipTerm] = 2147483647;
        } else {
          const end = invLists.rowPtr[t + 1]!;
          let p = wandCursors[skipTerm]!;
          while (p < end && invLists.colIdx[p]! < pivotDoc) p++;
          wandCursors[skipTerm] = p;
          wandDocIDs[skipTerm] = p < end ? invLists.colIdx[p]! : 2147483647;
        }
      }

      let allDone = true;
      for (let i = 0; i < nq; i++) {
        if (wandDocIDs[i] !== 2147483647) {
          allDone = false;
          break;
        }
      }
      if (allDone) break;
    }

    let count = 0;
    for (let i = 0; i < k; i++) {
      if (this.bm25Scr[i] === -Infinity) break;
      count++;
    }
    return count;
  }

  private expandQuery(
    qTerms: Int32Array,
    qWeights: Float32Array,
    nq: number,
    steps: number,
    alpha: number,
    outTerms: Int32Array,
    outWeights: Float32Array,
  ): number {
    const { cooccur, expandScores, expandVisited, numTerms } = this;
    expandScores.fill(0);
    expandVisited.fill(0);

    for (let i = 0; i < nq; i++) {
      const t = qTerms[i]!;
      expandScores[t] = qWeights[i]!;
      expandVisited[t] = 1;
    }

    let cur: Float32Array = this.expandScores;
    let nxt: Float32Array = this.expandTemp;

    for (let s = 0; s < steps; s++) {
      nxt.fill(0);
      for (let t = 0; t < numTerms; t++) {
        const val = cur[t]!;
        if (val === 0) continue;
        const start = cooccur.rowPtr[t]!;
        const end = cooccur.rowPtr[t + 1]!;
        for (let p = start; p < end; p++) {
          const nb = cooccur.colIdx[p]!;
          nxt[nb] += val * cooccur.values[p]!;
        }
      }
      for (let t = 0; t < numTerms; t++) {
        const teleport = expandVisited[t] ? cur[t]! : 0;
        nxt[t] = (1 - alpha) * nxt[t]! + alpha * teleport;
      }
      const sw = cur;
      cur = nxt;
      nxt = sw;
    }

    let count = 0;
    let sum = 0,
      sq = 0;
    for (let t = 0; t < numTerms; t++) {
      const v = cur[t]!;
      if (v > 0) {
        sum += v;
        sq++;
      }
    }
    const thresh = sq > 0 ? (sum / sq) * 0.3 : 0;
    const maxOut = Math.min(64, outTerms.length);

    for (let t = 0; t < numTerms && count < maxOut; t++) {
      if (cur[t]! > thresh) {
        outTerms[count] = t;
        outWeights[count] = cur[t]!;
        count++;
      }
    }

    let norm = 0;
    for (let i = 0; i < count; i++) norm += outWeights[i]! * outWeights[i]!;
    const invNorm = norm > 1e-10 ? 1.0 / Math.sqrt(norm) : 0;
    for (let i = 0; i < count; i++) outWeights[i] *= invNorm;

    return count;
  }

  private simhashRerank(
    candidates: Int32Array,
    numCandidates: number,
    queryFHRR: Float32Array,
  ): void {
    topkReset(this.kBm25, this.simIdx, this.simScr, this.simMin);
    this.queryHash.fill(0);
    for (let b = 0; b < this.numBits; b++) {
      let dot = 0;
      const pOff = b * this.dim;
      let j = 0;
      for (; j <= this.dim - 4; j += 4) {
        dot += queryFHRR[j]! * this.projection[pOff + j]!;
        dot += queryFHRR[j + 1]! * this.projection[pOff + j + 1]!;
        dot += queryFHRR[j + 2]! * this.projection[pOff + j + 2]!;
        dot += queryFHRR[j + 3]! * this.projection[pOff + j + 3]!;
      }
      for (; j < this.dim; j++)
        dot += queryFHRR[j]! * this.projection[pOff + j]!;
      if (dot > 0) this.queryHash[b >> 5] |= 1 << (b & 31);
    }

    const { words, fingerprints, numBits } = this;
    for (let i = 0; i < numCandidates; i++) {
      const d = candidates[i]!;
      const hOff = d * words;
      let hamming = 0;
      let w = 0;
      for (; w <= words - 4; w += 4) {
        hamming += popcount32(this.queryHash[w]! ^ fingerprints[hOff + w]!);
        hamming += popcount32(
          this.queryHash[w + 1]! ^ fingerprints[hOff + w + 1]!,
        );
        hamming += popcount32(
          this.queryHash[w + 2]! ^ fingerprints[hOff + w + 2]!,
        );
        hamming += popcount32(
          this.queryHash[w + 3]! ^ fingerprints[hOff + w + 3]!,
        );
      }
      for (; w < words; w++) {
        hamming += popcount32(this.queryHash[w]! ^ fingerprints[hOff + w]!);
      }
      const sim = numBits - hamming;
      topkInsert(this.kBm25, this.simIdx, this.simScr, this.simMin, d, sim);
    }
  }

  private fuse(
    numBm25: number,
    numSim: number,
    wBm25: number,
    wSim: number,
  ): void {
    topkReset(this.kFinal, this.finalIdx, this.finalScr, this.finalMin);
    this.candMask.fill(0);

    let maxBm25 = 0;
    for (let i = 0; i < numBm25; i++) {
      if (this.bm25Scr[i]! > maxBm25) maxBm25 = this.bm25Scr[i]!;
    }
    const invMaxBm25 = maxBm25 > 1e-10 ? 1.0 / maxBm25 : 0;

    let maxSim = 0;
    for (let i = 0; i < numSim; i++) {
      if (this.simScr[i]! > maxSim) maxSim = this.simScr[i]!;
    }
    const invMaxSim = maxSim > 1e-10 ? 1.0 / maxSim : 0;

    for (let i = 0; i < numBm25; i++) {
      const d = this.bm25Idx[i]!;
      if (this.candMask[d]) continue;
      this.candMask[d] = 1;
      const sBm25 = this.bm25Scr[i]! * invMaxBm25;
      let sSim = 0;
      for (let j = 0; j < numSim; j++) {
        if (this.simIdx[j] === d) {
          sSim = this.simScr[j]! * invMaxSim;
          break;
        }
      }
      const score = wBm25 * sBm25 + wSim * sSim;
      topkInsert(
        this.kFinal,
        this.finalIdx,
        this.finalScr,
        this.finalMin,
        d,
        score,
      );
    }

    for (let i = 0; i < numSim; i++) {
      const d = this.simIdx[i]!;
      if (this.candMask[d]) continue;
      this.candMask[d] = 1;
      const sSim = this.simScr[i]! * invMaxSim;
      let sBm25 = 0;
      for (let j = 0; j < numBm25; j++) {
        if (this.bm25Idx[j] === d) {
          sBm25 = this.bm25Scr[j]! * invMaxBm25;
          break;
        }
      }
      const score = wBm25 * sBm25 + wSim * sSim;
      topkInsert(
        this.kFinal,
        this.finalIdx,
        this.finalScr,
        this.finalMin,
        d,
        score,
      );
    }
  }

  query(
    qTerms: Int32Array,
    qIDF: Float32Array,
    qFHRR: Float32Array,
    nq: number,
    outIndices: Int32Array,
    outScores: Float32Array,
    options?: {
      expand?: boolean;
      expandSteps?: number;
      expandAlpha?: number;
      wBm25?: number;
      wSim?: number;
    },
  ): void {
    outIndices.fill(-1);
    outScores.fill(-Infinity);

    const opt = options || {};
    const doExpand = opt.expand ?? false;
    const expSteps = opt.expandSteps ?? 2;
    const expAlpha = opt.expandAlpha ?? 0.3;
    const wBm25 = opt.wBm25 ?? 0.6;
    const wSim = opt.wSim ?? 0.4;

    let activeTerms = qTerms;
    let activeIDF = qIDF;
    let activeN = nq;

    if (doExpand && this.cooccur.rows > 0) {
      activeN = this.expandQuery(
        qTerms,
        qIDF,
        nq,
        expSteps,
        expAlpha,
        this.expTermsBuf,
        this.expWeightsBuf,
      );
      activeTerms = this.expTermsBuf;
      activeIDF = this.expWeightsBuf;
    }

    const numBm25 = this.wandSearch(activeTerms, activeIDF, activeN);
    this.simhashRerank(this.bm25Idx, numBm25, qFHRR);

    let numSim = 0;
    for (let i = 0; i < this.kBm25; i++) {
      if (this.simScr[i] === -Infinity) break;
      numSim++;
    }

    this.fuse(numBm25, numSim, wBm25, wSim);

    for (let i = 0; i < this.kFinal; i++) {
      outIndices[i] = this.finalIdx[i]!;
      outScores[i] = this.finalScr[i]!;
    }
  }

  getIndexSizeMB(): number {
    const wandBytes =
      this.invLists.values.length * 4 +
      this.invLists.colIdx.length * 4 +
      this.invLists.rowPtr.length * 4;
    const cooccurBytes =
      this.cooccur.values.length * 4 +
      this.cooccur.colIdx.length * 4 +
      this.cooccur.rowPtr.length * 4;
    const fpBytes = this.fingerprints.length * 4;
    const projBytes = this.projection.length * 4;
    const poolBytes = this.expandScores.length * 4 + this.candMask.length;
    return (
      (wandBytes + cooccurBytes + fpBytes + projBytes + poolBytes) /
      (1024 * 1024)
    );
  }
}
