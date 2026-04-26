export class CSRMatrix {
  readonly rows: number;
  readonly cols: number;
  readonly nnz: number;
  readonly values: Float32Array;
  readonly colIdx: Int32Array;
  readonly rowPtr: Int32Array;

  constructor(rows: number, cols: number, nnz: number, values?: Float32Array, colIdx?: Int32Array, rowPtr?: Int32Array) {
    this.rows = rows;
    this.cols = cols;
    this.nnz = nnz;
    this.values = values ?? new Float32Array(nnz);
    this.colIdx = colIdx ?? new Int32Array(nnz);
    this.rowPtr = rowPtr ?? new Int32Array(rows + 1);
  }
}
// Note: Simpanan file full Topology Graph disimpan di file ini sementara
