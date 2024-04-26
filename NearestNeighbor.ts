export class NearestNeighbor {
    public readonly vertices: [[number, number, number], Set<[number, number]>][];
    public readonly edges: [[number, number], number[]][];
    public readonly triangles: [number[], number[]][];
    public readonly edgeMap: Map<[number, number], number>;
    public readonly triangleMap: Map<number[], number>;

    public constructor(vertices: [number, number, number][], edges: [number, number][], triangles: number[][]) {
        // fill out data
        this.vertices = vertices.map(v => [v, new Set<[number, number]>()] as [[number, number, number], Set<[number, number]>]);
        this.edges = edges.map(e => [e, new Array(2).fill(null)] as [[number, number], number[]]);
        this.triangles = triangles.map(t => [t, []] as [number[], number[]]);
        this.edgeMap = new Map<[number, number], number>(this.edges.map(([v], i) => [v, i]));
        this.triangleMap = new Map<number[], number>(this.triangles.map(([v], i) => [v, i]));

        // set edges from triangles
        for (const triangle of this.triangles) {
            for (const edgeIndex of triangle[0]) {
                this.edges[edgeIndex][1] = triangle[0];
            }
        }

        // set vertices from edges
        for (const edge of this.edges) {
            for (const vertexIndex of edge[0]) {
                this.vertices[vertexIndex][1].add(edge[0]);
            }
        }

        // nearest neighbor algorithm
        for (const triangle of this.triangles) {
            for (const edgeIndex of triangle[0]) {
                const vertexA = this.edges[edgeIndex][0][0];
                const vertexB = this.edges[edgeIndex][0][1];
                const setA = this.vertices[vertexA][1];
                const setB = this.vertices[vertexB][1];
                const intersection = new Set<[number, number]>();
                for (const v of setA.values()) {
                    if (setB.has(v)) {
                        intersection.add(v);
                    }
                }
                for (const edge2 of intersection) {
                    if (this.edges[edgeIndex][0] === edge2) {
                        continue;
                    }
                    const edgeIndex2 = this.edgeMap.get(edge2);
                    const triangleInsert = this.edges[edgeIndex2][1];
                    const insertIndex = this.triangleMap.get(triangleInsert);
                    const setIndex = this.triangleMap.get(triangle[0]);
                    this.triangles[setIndex][1].push(insertIndex);
                }
            }
        }
    }

    public getNearestNeighborIndicesFromIndex(triangleIndex: number): number[] {
        return this.triangles[triangleIndex][1];
    }

    public getNearestNeighborIndices(triangle: number[]): number[] {
        const triangleIndex = this.triangleMap.get(triangle);
        return this.getNearestNeighborIndicesFromIndex(triangleIndex);
    }

    public getNearestNeighborData(triangle: number[]): number[][] {
        return this.getNearestNeighborIndices(triangle).map(index => this.triangles[index][0]);
    }
}