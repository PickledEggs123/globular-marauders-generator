import {ICameraState, IGameMesh} from "@pickledeggs123/globular-marauders-game/lib/src/Interface";
import {Game, Star, VoronoiTerrain} from "@pickledeggs123/globular-marauders-game/lib/src";
import {Accessor, Document as GltfDocument, WebIO} from "@gltf-transform/core";
import {VoronoiCell, VoronoiGraph} from "@pickledeggs123/globular-marauders-game/lib/src/Graph";
import {DelaunayGraph} from "@pickledeggs123/globular-marauders-game/lib/src/Graph";
import {
    ISerializedTree,
    VoronoiTree,
    VoronoiTreeNode
} from "@pickledeggs123/globular-marauders-game/lib/src/VoronoiTree";
import * as Quaternion from "quaternion";
import seedrandom from "seedrandom";
import delaunayMesh from "./output.delaunay.json";
import {NearestNeighbor} from "./NearestNeighbor";

export interface IGameSpawnPoint {
    point: [number, number, number];
}

export interface IGameBuilding {
    type: "PORT" | "HOUSE" | "TEMPLE";
    point: [number, number, number];
    lookAt: [number, number, number];
}

export const generatePlanetMesh = (game: Game, voronoiTree: VoronoiTerrain, planetVoronoiCells: VoronoiCell[], biomeVoronoiCells: VoronoiCell[] | undefined = undefined, areaVoronoiCells: VoronoiCell[] | undefined = undefined, walkingVoronoiCells: VoronoiCell[] | undefined = undefined, breakApart: boolean) => {
    let planetGeometryData = {
        position: [] as number[],
        color: [] as number[],
        normal: [] as number[],
        index: [] as number[],
        collidable: false as boolean,
        navmesh: false as boolean,
        ocean: false as boolean,
        oceanNavmesh: false as boolean,
        fullMesh: false as boolean,
    };
    let heightMapData: [number, number][] | null = null;
    let colorData: [number, [number, number, number]][] | null = null;
    const meshes: IGameMesh[] = [];
    const spawnPoints: IGameSpawnPoint[] = [];
    const buildings: IGameBuilding[] = [];

    const makeMesh = () => {
        const mesh = {
            attributes: planetGeometryData.navmesh || planetGeometryData.ocean || planetGeometryData.oceanNavmesh ? [{
                id: "aPosition", buffer: planetGeometryData.position, size: 3
            }] : [{
                id: "aPosition", buffer: planetGeometryData.position, size: 3
            }, {
                id: "aColor", buffer: planetGeometryData.color, size: 3
            }, {
                id: "aNormal", buffer: planetGeometryData.normal, size: 3
            }],
            index: planetGeometryData.index,
            collidable: planetGeometryData.collidable,
            navmesh: planetGeometryData.navmesh,
            ocean: planetGeometryData.ocean,
            oceanNavmesh: planetGeometryData.oceanNavmesh,
        } as IGameMesh;
        planetGeometryData.position = [];
        planetGeometryData.color = [];
        planetGeometryData.normal = [];
        planetGeometryData.index = [];
        return mesh;
    };

    const generateMesh = (voronoiCells: VoronoiCell[], colors: [VoronoiCell, [number, number, number]][]) => {
        const remeshAsDelaunay = () => {
            const game = new Game();
            const delaunay = new DelaunayGraph(game);
            delaunay.triangles = delaunayMesh.triangles as number[][];
            delaunay.edges = delaunayMesh.edges as [number, number][];
            delaunay.vertices = delaunayMesh.vertices as [number, number, number][];
            const voronoiTree = new VoronoiTree(game);
            voronoiTree.defaultRecursionNodeLevels = [30, 5, 5, 5];
            const points = new Map<[number, number, number], [[number, number, number], number]>();
            const colorMap = new Map<VoronoiCell, [number, number, number]>(colors);

            // get nearest neighbor information
            const nearestNeighbor = new NearestNeighbor(delaunay.vertices, delaunay.edges, delaunay.triangles);

            // build blank delaunay mesh quickly
            for (const lastPoint of delaunay.vertices) {
                const star = new Star(game);
                star.position = Quaternion.fromBetweenVectors([0, 0, 1], lastPoint);
                // @ts-ignore
                star.data = lastPoint;
                voronoiTree.addItem(star);
            }

            // convert voronoi vertices into
            for (const v of voronoiCells) {
                const handlePoint = (point: [number, number, number]) => {
                    let p = DelaunayGraph.normalize(point);
                    const height = DelaunayGraph.distanceFormula([0, 0, 0], point);
                    // @ts-ignore
                    let nearestPoints = Array.from(voronoiTree.listItems(p, 0.0001)).map(star => star.data).filter((v) => VoronoiGraph.angularDistance(p, v, 1) < 0.0001);
                    if (nearestPoints.length < 1) {
                        // @ts-ignore
                        nearestPoints = Array.from(voronoiTree.listItems(p, 0.001)).map(star => star.data).filter((v) => VoronoiGraph.angularDistance(p, v, 1) < 0.001)
                    }
                    if (nearestPoints.length < 1) {
                        // @ts-ignore
                        nearestPoints = Array.from(voronoiTree.listItems(p, 0.01)).map(star => star.data).filter((v) => VoronoiGraph.angularDistance(p, v, 1) < 0.01)
                    }
                    if (nearestPoints.length < 1) {
                        // @ts-ignore
                        nearestPoints = Array.from(voronoiTree.listItems(p, 0.1)).map(star => star.data).filter((v) => VoronoiGraph.angularDistance(p, v, 1) < 0.1)
                    }
                    for (const nearestPoint of nearestPoints) {
                        if (points.has(nearestPoint) && points.get(nearestPoint)![1] < height) {
                            points.set(nearestPoint, [colorMap.get(v)!, height]);
                        }
                        if (!points.has(nearestPoint)) {
                            points.set(nearestPoint, [colorMap.get(v)!, height]);
                        }
                    }
                    return;
                };
                v.vertices.forEach(handlePoint);
                handlePoint(v.centroid);
            }

            const firstFourPoints = delaunay.vertices.slice(0, 4);
            const firstFourPointsPoints = firstFourPoints.map(pp => Array.from(points.keys()).reduce((acc, v) => VoronoiGraph.angularDistance(pp, v, 1) < VoronoiGraph.angularDistance(pp, acc, 1) ? v : acc));
            firstFourPointsPoints.forEach((pp, index) => {
                const data = points.get(pp)!;
                points.set(firstFourPoints[index], data);
            });

            // extract triangles
            const vertices = delaunay.triangles.map(t => {
                const colorItem = points.get(delaunay.vertices[delaunay.edges[t[0]][0]]) ?? points.get(delaunay.vertices[delaunay.edges[t[1]][0]]) ?? points.get(delaunay.vertices[delaunay.edges[t[2]][0]]) ?? Array.from(points.values())[0]!;
                return {
                    vertex: [delaunay.vertices[delaunay.edges[t[0]][0]], delaunay.vertices[delaunay.edges[t[1]][0]], delaunay.vertices[delaunay.edges[t[2]][0]]],
                    color: [(points.get(delaunay.vertices[delaunay.edges[t[0]][0]]) ?? colorItem)[0], (points.get(delaunay.vertices[delaunay.edges[t[1]][0]]) ?? colorItem)[0], (points.get(delaunay.vertices[delaunay.edges[t[2]][0]]) ?? colorItem)[0]],
                    indices: [delaunay.edges[t[0]][0], delaunay.edges[t[1]][0], delaunay.edges[t[2]][0]],
                };
            });
            delaunay.vertices.forEach(vertex => {
                const height = (points.get(vertex) ?? [0, 0.94])[1];
                vertex[0] *= height;
                vertex[1] *= height;
                vertex[2] *= height;
                const color = (points.get(vertex) ?? [[0, 1, 0], 1])[0];
                if (height > 0.99 && height < 1.01 && color[2] === 1) {
                    color[0] = 0.33;
                    color[1] = 1;
                    color[2] = 0.33;
                }
            });
            return {
                vertices,
                nearestNeighbor
            };
        };

        const {
            vertices: remesh,
            nearestNeighbor: nearestNeighborData,
        } = remeshAsDelaunay();

        let indexSet = [] as [number, number, number][];
        let indexVoronoiGame = new Game();
        let indexVoronoiTree = new VoronoiTree(indexVoronoiGame);
        indexVoronoiTree.defaultRecursionNodeLevels = [30, 5, 5, 5];
        const resetIndexSet = () => {
            indexSet = [] as [number, number, number][];
            indexVoronoiGame = new Game();
            indexVoronoiTree = new VoronoiTree(indexVoronoiGame);
            indexVoronoiTree.defaultRecursionNodeLevels = [30, 5, 5, 5];
        };
        const addToMesh = (data?: {vertex: [[number, number, number], [number, number, number], [number, number, number]], color: [[number, number, number], [number, number, number], [number, number, number]], indices: [number, number, number]}) => {
            if (!data) {
                return;
            }

            const {vertex: vertexData, color: colorData, indices: indexData} = data;

            if (planetGeometryData.navmesh || planetGeometryData.ocean || planetGeometryData.oceanNavmesh) {
                const handleVertex = (p: [number, number, number], i: number) => {
                    // @ts-ignore
                    const voronoiTreeSearch = (Array.from(indexVoronoiTree.listItems(p, 0.0001)).map((s) => s.data).find((v) => VoronoiGraph.angularDistance(p, v[0], 1) < 0.0001) ?? [[0, 0, 0], -1])[1];
                    const index = voronoiTreeSearch >= 0 ? voronoiTreeSearch : indexSet.findIndex((v) => VoronoiGraph.angularDistance(p, v, 1) < 0.0001);
                    if (index >= 0) {
                        planetGeometryData.index.push(index);
                    } else {
                        planetGeometryData.position.push.apply(planetGeometryData.position, p);
                        planetGeometryData.index.push(indexSet.length);
                        indexSet.push(p);
                        const star = new Star(indexVoronoiGame);
                        star.position = Quaternion.fromBetweenVectors([0, 0, 1], p);
                        // @ts-ignore
                        star.data = [p, index];
                        indexVoronoiTree.addItem(star);
                    }
                };
                handleVertex(vertexData[0], indexData[0]);
                handleVertex(vertexData[1], indexData[1]);
                handleVertex(vertexData[2], indexData[2]);
            } else {
                // initial center index
                let startingIndex = planetGeometryData.index.length;

                const normal = DelaunayGraph.crossProduct(
                    DelaunayGraph.normalize(DelaunayGraph.subtract(vertexData[1], vertexData[0])),
                    DelaunayGraph.normalize(DelaunayGraph.subtract(vertexData[2], vertexData[0]))
                );

                // triangle 1

                // startingIndex 0
                planetGeometryData.position.push.apply(planetGeometryData.position, vertexData[0]);
                planetGeometryData.color.push.apply(planetGeometryData.color, colorData[0]);
                planetGeometryData.normal.push.apply(planetGeometryData.normal, normal);

                // startingIndex 1
                planetGeometryData.position.push.apply(planetGeometryData.position, vertexData[1]);
                planetGeometryData.color.push.apply(planetGeometryData.color, colorData[1]);
                planetGeometryData.normal.push.apply(planetGeometryData.normal, normal);

                // startingIndex 2
                planetGeometryData.position.push.apply(planetGeometryData.position, vertexData[2]);
                planetGeometryData.color.push.apply(planetGeometryData.color, colorData[2]);
                planetGeometryData.normal.push.apply(planetGeometryData.normal, normal);

                // indices
                planetGeometryData.index.push(startingIndex, startingIndex + 1, startingIndex + 2);

                if (breakApart && startingIndex >= 8000 && !planetGeometryData.navmesh && !planetGeometryData.ocean && !planetGeometryData.oceanNavmesh && !planetGeometryData.fullMesh) {
                    meshes.push(makeMesh());
                }
            }
        };

        if (breakApart) {
            // handle water
            const water = remesh.map(v => v.vertex.some(vert => DelaunayGraph.distanceFormula([0, 0, 0], vert) < 0.99) ? v : null);
            water.forEach(addToMesh);
            meshes.push(makeMesh());

            // handle collidable land
            planetGeometryData.collidable = true;
            const land = remesh.map(v => !v.vertex.some(vert => DelaunayGraph.distanceFormula([0, 0, 0], vert) < 0.99) ? v : null);
            land.forEach(addToMesh);
            meshes.push(makeMesh());

            // handle nav mesh
            planetGeometryData.collidable = false;
            planetGeometryData.navmesh = true;
            const navmesh = remesh.map(v => !v.vertex.some(vert => DelaunayGraph.distanceFormula([0, 0, 0], vert) < 0.99) ? v : null);
            navmesh.forEach(addToMesh);
            meshes.push(makeMesh());
            resetIndexSet();

            planetGeometryData.collidable = false;
            planetGeometryData.navmesh = false;
            planetGeometryData.ocean = true;
            planetGeometryData.oceanNavmesh = true;
            let ocean = remesh.map(v => v.vertex.some(vert => DelaunayGraph.distanceFormula([0, 0, 0], vert) < 0.99) ? v : null);
            ocean = ocean.map((d) => {
                if (!d) {
                    return d;
                }

                let o = {
                    ...d,
                    vertex: d.vertex.map(v => DelaunayGraph.normalize(v)),
                };
                return o;
            });
            ocean.forEach(addToMesh);
            meshes.push(makeMesh());
            resetIndexSet();

            // find the biggest shore
            planetGeometryData.collidable = false;
            planetGeometryData.navmesh = false;
            planetGeometryData.ocean = false;
            planetGeometryData.oceanNavmesh = false;
            planetGeometryData.fullMesh = true;
            let shore = remesh.map(v => v.vertex.some(vert => (DelaunayGraph.distanceFormula([0, 0, 0], vert) > 0.99 && DelaunayGraph.distanceFormula([0, 0, 0], vert) < 1.01)) ? v : null);
            const shoreSets: Set<number>[] = [];
            const shoreFullSet = new Map<any, number>(shore.map((v, i) => [v, i] as [any, number]).filter(x => !!x[0]));
            while (shoreFullSet.size > 0) {
                const shoreSet: Set<number> = new Set<number>();
                const expandSet: Set<number> = new Set<number>();
                do {
                    const shoreSeedIndex = expandSet.size > 0 ? Array.from(expandSet.values())[0] : Array.from(shoreFullSet.values())[0];
                    shoreSet.add(shoreSeedIndex);
                    shoreFullSet.delete(shore[shoreSeedIndex]);
                    expandSet.delete(shoreSeedIndex);
                    const nearestNeighbors = nearestNeighborData.getNearestNeighborIndicesFromIndex(shoreSeedIndex);
                    for (const index of nearestNeighbors) {
                        // is null, do nothing
                        if (!shore[index]) {
                            continue;
                        }
                        // is added, do nothing
                        if (!shoreFullSet.has(shore[index])) {
                            continue;
                        }

                        // add shore set
                        shoreSet.add(index);
                        expandSet.add(index);
                    }
                } while (expandSet.size > 0);
                shoreSets.push(shoreSet);
            }
            for (const largestShore of shoreSets) {
                const shore2 = shore.map((v, i) => largestShore.has(i) ? v : null);

                // build port on shore
                const bestTriangle = shore2.filter(x =>
                    !!x &&
                    x.vertex.filter((x) => DelaunayGraph.distanceFormula([0, 0, 0], x) > 0.99 && DelaunayGraph.distanceFormula([0, 0, 0], x) < 1.01).length === 2 &&
                    x.vertex.filter((x) => DelaunayGraph.distanceFormula([0, 0, 0], x) > 0.93 && DelaunayGraph.distanceFormula([0, 0, 0], x) < 0.99).length === 1
                ).reduce((acc, x) => {
                    if (acc === null) {
                        return x;
                    }
                    const oldDistance = DelaunayGraph.distanceFormula(acc.vertex[0], acc.vertex[1]) + DelaunayGraph.distanceFormula(acc.vertex[1], acc.vertex[2]) + DelaunayGraph.distanceFormula(acc.vertex[2], acc.vertex[0]);
                    const newDistance = DelaunayGraph.distanceFormula(x.vertex[0], x.vertex[1]) + DelaunayGraph.distanceFormula(x.vertex[1], x.vertex[2]) + DelaunayGraph.distanceFormula(x.vertex[2], x.vertex[0]);
                    if (newDistance > oldDistance) {
                        return x;
                    } else {
                        return acc;
                    }
                }, null);
                if (bestTriangle) {
                    const inputToPortPoints = bestTriangle.vertex.filter((x) => DelaunayGraph.distanceFormula([0, 0, 0], x) > 0.99 && DelaunayGraph.distanceFormula([0, 0, 0], x) < 1.01);
                    const portPoint = inputToPortPoints.reduce((acc, x) => DelaunayGraph.add(acc, DelaunayGraph.normalize(x)), [0, 0, 0]);
                    portPoint[0] /= inputToPortPoints.length;
                    portPoint[1] /= inputToPortPoints.length;
                    portPoint[2] /= inputToPortPoints.length;

                    const initialPortDirection = bestTriangle.vertex.find((x) => DelaunayGraph.distanceFormula([0, 0, 0], x) > 0.93 && DelaunayGraph.distanceFormula([0, 0, 0], x) < 0.99);
                    const portDirection = DelaunayGraph.normalize(initialPortDirection);
                    buildings.push({
                        type: "PORT",
                        point: portPoint,
                        lookAt: portDirection,
                    });

                    // mark water as spawn point
                    const vectorDirection = DelaunayGraph.subtract(portDirection, portPoint);
                    const spawnPoint = DelaunayGraph.normalize(DelaunayGraph.add(portPoint, vectorDirection));
                    spawnPoints.push({
                        point: spawnPoint,
                    });
                }
            }

            // find the biggest islands
            let island = remesh.map(v => v.vertex.some(vert => DelaunayGraph.distanceFormula([0, 0, 0], vert) > 0.99) ? v : null);
            const islandSets: Set<number>[] = [];
            const islandFullSet = new Map<any, number>(island.map((v, i) => [v, i] as [any, number]).filter(x => !!x[0]));
            while (islandFullSet.size > 0) {
                const islandSet: Set<number> = new Set<number>();
                const expandSet: Set<number> = new Set<number>();
                do {
                    const islandSeedIndex = expandSet.size > 0 ? Array.from(expandSet.values())[0] : Array.from(islandFullSet.values())[0];
                    islandSet.add(islandSeedIndex);
                    islandFullSet.delete(island[islandSeedIndex]);
                    expandSet.delete(islandSeedIndex);
                    const nearestNeighbors = nearestNeighborData.getNearestNeighborIndicesFromIndex(islandSeedIndex);
                    for (const index of nearestNeighbors) {
                        // is null, do nothing
                        if (!island[index]) {
                            continue;
                        }
                        // is added, do nothing
                        if (!islandFullSet.has(island[index])) {
                            continue;
                        }

                        // add island set
                        islandSet.add(index);
                        expandSet.add(index);
                    }
                } while (expandSet.size > 0);
                islandSets.push(islandSet);
            }
            for (const largestIsland of islandSets) {
                const island2 = island.map((v, i) => largestIsland.has(i) ? v : null);

                // build port on island
                const bestTriangles = island2.filter(x =>
                    !!x &&
                    (
                        x.vertex.filter((x) => DelaunayGraph.distanceFormula([0, 0, 0], x) > 0.99 && DelaunayGraph.distanceFormula([0, 0, 0], x) < 1.01).length === 3 ||
                        x.vertex.filter((x) => DelaunayGraph.distanceFormula([0, 0, 0], x) > 1.01 && DelaunayGraph.distanceFormula([0, 0, 0], x) < 1.03).length === 3 ||
                        x.vertex.filter((x) => DelaunayGraph.distanceFormula([0, 0, 0], x) > 1.03 && DelaunayGraph.distanceFormula([0, 0, 0], x) < 1.05).length === 3 ||
                        x.vertex.filter((x) => DelaunayGraph.distanceFormula([0, 0, 0], x) > 1.05 && DelaunayGraph.distanceFormula([0, 0, 0], x) < 1.07).length === 3 ||
                        x.vertex.filter((x) => DelaunayGraph.distanceFormula([0, 0, 0], x) > 1.07 && DelaunayGraph.distanceFormula([0, 0, 0], x) < 1.09).length === 3 ||
                        x.vertex.filter((x) => DelaunayGraph.distanceFormula([0, 0, 0], x) > 1.09 && DelaunayGraph.distanceFormula([0, 0, 0], x) < 1.11).length === 3
                    )
                );
                const houseSet = bestTriangles.slice(0, Math.ceil(bestTriangles.length / 20));
                const getHeight = (x) => {
                    let height = 0;
                    if (x.vertex.filter((x) => DelaunayGraph.distanceFormula([0, 0, 0], x) > 0.99 && DelaunayGraph.distanceFormula([0, 0, 0], x) < 1.01).length === 3) {
                        height = 0;
                    }
                    if (x.vertex.filter((x) => DelaunayGraph.distanceFormula([0, 0, 0], x) > 1.01 && DelaunayGraph.distanceFormula([0, 0, 0], x) < 1.03).length === 3) {
                        height = 1;
                    }
                    if (x.vertex.filter((x) => DelaunayGraph.distanceFormula([0, 0, 0], x) > 1.03 && DelaunayGraph.distanceFormula([0, 0, 0], x) < 1.05).length === 3) {
                        height = 2;
                    }
                    if (x.vertex.filter((x) => DelaunayGraph.distanceFormula([0, 0, 0], x) > 1.05 && DelaunayGraph.distanceFormula([0, 0, 0], x) < 1.07).length === 3) {
                        height = 3;
                    }
                    if (x.vertex.filter((x) => DelaunayGraph.distanceFormula([0, 0, 0], x) > 1.07 && DelaunayGraph.distanceFormula([0, 0, 0], x) < 1.09).length === 3) {
                        height = 4;
                    }
                    if (x.vertex.filter((x) => DelaunayGraph.distanceFormula([0, 0, 0], x) > 1.09 && DelaunayGraph.distanceFormula([0, 0, 0], x) < 1.11).length === 3) {
                        height = 5;
                    }
                    return height;
                };
                const maxHeight = houseSet.reduce((acc, x) => {
                    const height = getHeight(x);
                    return Math.max(height, acc);
                }, 0);
                for (const bestTriangle of houseSet) {
                    const inputToHousePoints = bestTriangle.vertex;
                    const housePoint = inputToHousePoints.reduce((acc, x) => DelaunayGraph.add(acc, x), [0, 0, 0]);
                    housePoint[0] /= inputToHousePoints.length;
                    housePoint[1] /= inputToHousePoints.length;
                    housePoint[2] /= inputToHousePoints.length;

                    const houseDirection = bestTriangle.vertex.find((x) => !!x);

                    const type = game.seedRandom.double() * (getHeight(bestTriangle) / maxHeight) > 0.8 ? "TEMPLE" : "HOUSE";
                    buildings.push({
                        type,
                        point: housePoint,
                        lookAt: houseDirection,
                    });
                }
            }
        } else {
            remesh.forEach(addToMesh);
            meshes.push(makeMesh());
        }
    }
    const colors = planetVoronoiCells.map((x) => {
        const color: [number, number, number] = game.seedRandom.double() > 0.20 ? [0.33, 0.33, 1] : [0.33, 1, 0.33];
        return [x, color] as [VoronoiCell, [number, number, number]];
    });
    const modifyWaterVertexHeight = (vertex: [number, number, number], v: VoronoiCell, colorMap: Map<VoronoiCell, [number, number, number]>) => {
        let height = 0;
        if (colorMap.get(v)![2] === 1) {
            height = -3;
        }
        const output = DelaunayGraph.normalize(vertex);
        output[0] *= height * 0.02 + 1;
        output[1] *= height * 0.02 + 1;
        output[2] *= height * 0.02 + 1;
        return output;
    };
    if (!biomeVoronoiCells && !areaVoronoiCells && !walkingVoronoiCells) {
        // modify planetVoronoiCells with new heights
        const colorMap = new Map<VoronoiCell, [number, number, number]>(colors);
        for (const voronoi of planetVoronoiCells) {
            voronoi.centroid = modifyWaterVertexHeight(voronoi.centroid, voronoi, colorMap);
            voronoi.vertices = voronoi.vertices.map(v => modifyWaterVertexHeight(v, voronoi, colorMap));
        }
        generateMesh(planetVoronoiCells, colors);
    } else if (!areaVoronoiCells && !walkingVoronoiCells) {
        const colors2 = biomeVoronoiCells.map((x) => {
            const colorPair1 = colors.find(item => item[0].containsPoint(x.centroid));
            const colorPair2 = colorPair1 ? null : colors.map((y) => [y, VoronoiGraph.angularDistance(y[0].centroid, x.centroid, 1)] as [[VoronoiCell, [number, number, number]], number]).sort((a, b) => a[1] - b[1]).map(y => y[0])[0];
            const color: [number, number, number] = (colorPair1 ?? colorPair2)[1];
            return [x, color] as [VoronoiCell, [number, number, number]];
        });
        // modify planetVoronoiCells with new heights
        const colorMap = new Map<VoronoiCell, [number, number, number]>(colors2);
        for (const voronoi of biomeVoronoiCells) {
            voronoi.centroid = modifyWaterVertexHeight(voronoi.centroid, voronoi, colorMap);
            voronoi.vertices = voronoi.vertices.map(v => modifyWaterVertexHeight(v, voronoi, colorMap));
        }
        generateMesh(biomeVoronoiCells, colors2);
    } else if (!walkingVoronoiCells) {
        // extrapolate color to area cells
        const colors2 = biomeVoronoiCells.map((x) => {
            const colorPair1 = colors.find(item => item[0].containsPoint(x.centroid));
            const colorPair2 = colorPair1 ? null : colors.map((y) => [y, VoronoiGraph.angularDistance(y[0].centroid, x.centroid, 1)] as [[VoronoiCell, [number, number, number]], number]).sort((a, b) => a[1] - b[1]).map(y => y[0])[0];
            const color: [number, number, number] = (colorPair1 ?? colorPair2)[1];
            return [x, color] as [VoronoiCell, [number, number, number]];
        });
        let colors3 = areaVoronoiCells.map((x, i) => {
            const colorPair1 = colors2.find(item => item[0].containsPoint(x.centroid));
            const colorPair2 = colorPair1 ? null : colors2.map((y) => [y, VoronoiGraph.angularDistance(y[0].centroid, x.centroid, 1)] as [[VoronoiCell, [number, number, number]], number]).sort((a, b) => a[1] - b[1]).map(y => y[0])[0];
            const color: [number, number, number] = (colorPair1 ?? colorPair2)[1];
            return [x, color] as [VoronoiCell, [number, number, number]];
        });

        // compute height
        const heightMap = new Map(colors3.map(([x, color]) => [x, color[1] === 1 ? 0 : -1]));
        const heightSet = new Set(Array.from(heightMap).map(x => x[0]));
        for (let i = 0; i < 5; i++) {
            const heightDynamicProgramming = Array.from(heightSet);
            const game = new Game();
            const voronoiTree = new VoronoiTree<Star>(game);
            for (const x of heightDynamicProgramming) {
                const star = new Star(game);
                star.position = Quaternion.fromBetweenVectors([0, 0, 1], x.centroid);
                // @ts-ignore
                star.voronoi = x;
                voronoiTree.addItem(star);
            }
            const minHeight = heightDynamicProgramming.map(x => {
                // @ts-ignore
                const voronoiNeighbors = Array.from(voronoiTree.listItems(x.centroid)).filter(y => VoronoiGraph.angularDistance(x.centroid, y.voronoi.centroid, 1) < 0.075);
                // @ts-ignore
                const neighbors = voronoiNeighbors.map(y => heightMap.get(y.voronoi)).filter(z => isFinite(z) && !isNaN(z));
                return [x, heightMap.get(x) >= 0 ? Math.min(...(neighbors.length ? neighbors : [-1])) + 1 : -(Math.min(2, ...(neighbors.length ? neighbors.map(y => y < 0 ? -y : 0) : [0])) + 1)] as [VoronoiCell, number];
            });
            for (const [x, height] of minHeight) {
                heightMap.set(x, height);
            }
        }
        heightMapData = Array.from(heightMap.entries()).map(([key, value]) => [areaVoronoiCells.indexOf(key), value] as [number, number]);

        // compute height of individual vertex
        const heightVertices = new Array<[[number, number, number], number]>();
        const heightVerticesTreeGame = new Game();
        const heightVerticesTree = new VoronoiTree<Star>(heightVerticesTreeGame);
        heightVerticesTree.defaultRecursionNodeLevels = [20, 5, 5, 5, 5];
        const heightEdges = new Array<[[number, number, number], [number, number, number], number]>();
        const heightEdgesTreeGame = new Game();
        const heightEdgesTree = new VoronoiTree<Star>(heightEdgesTreeGame);
        // load height edges
        for (const [x, height] of heightMap.entries()) {
            for (let i = 0; i < x.vertices.length; i++) {
                const a = x.vertices[i];
                const b = x.vertices[(i + 1) % x.vertices.length];
                const item = [a, b, height] as [[number, number, number], [number, number, number], number];
                const star1 = new Star(heightEdgesTreeGame);
                star1.position = Quaternion.fromBetweenVectors([0, 0, 1], a);
                // @ts-ignore
                star1.data = item;
                heightEdgesTree.addItem(star1);
                const star2 = new Star(heightEdgesTreeGame);
                star2.position = Quaternion.fromBetweenVectors([0, 0, 1], b);
                // @ts-ignore
                star2.data = item;
                heightEdgesTree.addItem(star2);
                heightEdges.push(item);
            }
        }
        for (const [x, height] of heightMap.entries()) {
            const insertHeightItem = (vertex: [number, number, number]) => {
                // @ts-ignore
                const heightVertexItem = Array.from(heightVerticesTree.listItems(vertex, Math.PI / 32)).map(star => star.data).find((item) => VoronoiGraph.angularDistance(item[0], vertex, 1) < 0.00001);
                // @ts-ignore
                const heightEdgeItem = Array.from(heightEdgesTree.listItems(vertex, Math.PI / 4)).map(star => star.data).find((item) => VoronoiGraph.angularDistance(item[0], vertex, 1) + VoronoiGraph.angularDistance(item[1], vertex, 1) < VoronoiGraph.angularDistance(item[0], item[1], 1) + 0.00001);
                // max height of shared vertex
                if (heightVertexItem && height > heightVertexItem[1]) {
                    heightVertexItem[1] = height;
                }
                if (heightVertexItem && heightEdgeItem && heightEdgeItem[2] > heightVertexItem[1]) {
                    heightVertexItem[1] = heightEdgeItem[2];
                }
                if (!heightVertexItem && heightEdgeItem) {
                    const item = [[vertex[0], vertex[1], vertex[2]], heightEdgeItem[2]] as [[number, number, number], number];
                    const star = new Star(heightVerticesTreeGame);
                    star.position = Quaternion.fromBetweenVectors([0, 0, 1], vertex);
                    // @ts-ignore
                    star.data = item;
                    heightVerticesTree.addItem(star);
                    heightVertices.push(item);
                }
                // new item
                if (!heightVertexItem && !heightEdgeItem) {
                    const item = [[vertex[0], vertex[1], vertex[2]], height] as [[number, number, number], number];
                    const star = new Star(heightVerticesTreeGame);
                    star.position = Quaternion.fromBetweenVectors([0, 0, 1], vertex);
                    // @ts-ignore
                    star.data = item;
                    heightVerticesTree.addItem(star);
                    heightVertices.push(item);
                }
            }
            // for each edge vertex
            for (const vertex of x.vertices) {
                insertHeightItem(vertex);
            }

            // for each centroid
            const centroid = x.centroid;
            insertHeightItem(centroid);
        }

        // modify areaVoronoiCells with new heights
        for (const voronoi of areaVoronoiCells) {
            const modifyVertex = (vertex: [number, number, number]) => {
                // @ts-ignore
                const arr = Array.from(heightVerticesTree.listItems(vertex, Math.PI / 32)).map(star => star.data);
                let heightItem = arr.find((item => VoronoiGraph.angularDistance(item[0], vertex, 1) < 0.00001));
                if (!heightItem && arr[0]) {
                    heightItem = arr.find((item => VoronoiGraph.angularDistance(item[0], vertex, 1) < 0.001));
                }
                if (!heightItem && arr[0]) {
                    heightItem = arr.find((item => VoronoiGraph.angularDistance(item[0], vertex, 1) < 0.1));
                }
                if (!heightItem && arr[0]) {
                    heightItem = arr[0];
                }
                if (!heightItem) {
                    heightItem = [[vertex[0], vertex[1], vertex[2]], 0];
                }
                const output = DelaunayGraph.normalize(vertex);
                output[0] *= heightItem[1] * 0.02 + 1;
                output[1] *= heightItem[1] * 0.02 + 1;
                output[2] *= heightItem[1] * 0.02 + 1;
                return output;
            };
            voronoi.centroid = modifyVertex(voronoi.centroid);
            voronoi.vertices = voronoi.vertices.map(modifyVertex);
        }

        // compute color from height
        colors3 = colors3.map(([x, color]) => {
            const height = heightMap.get(x);
            if (height >= 0) {
                const newColor = [color[0], color[1] - height / 5.0 * 0.66, color[2]];
                return [x, newColor] as [VoronoiCell, [number, number, number]];
            } else if (height < 0) {
                const newColor = [color[0] + (3.0 + height) / 10.0 * 0.66, color[1] + (3.0 + height) / 10.0 * 0.66, color[2]];
                return [x, newColor] as [VoronoiCell, [number, number, number]];
            }
        });
        colorData = Array.from(colors3.entries()).map(([key, value]) => [areaVoronoiCells.indexOf(value[0]), value[1]] as [number, [number, number, number]]);
        generateMesh(areaVoronoiCells, colors3);
    } else {
        // extrapolate color to area cells
        const colors2 = biomeVoronoiCells.map((x) => {
            const colorPair1 = colors.find(item => item[0].containsPoint(x.centroid));
            const colorPair2 = colorPair1 ? null : colors.map((y) => [y, VoronoiGraph.angularDistance(y[0].centroid, x.centroid, 1)] as [[VoronoiCell, [number, number, number]], number]).sort((a, b) => a[1] - b[1]).map(y => y[0])[0];
            const color: [number, number, number] = (colorPair1 ?? colorPair2)[1];
            return [x, color] as [VoronoiCell, [number, number, number]];
        });
        let colors3 = areaVoronoiCells.map((x, i) => {
            const colorPair1 = colors2.find(item => item[0].containsPoint(x.centroid));
            const colorPair2 = colorPair1 ? null : colors2.map((y) => [y, VoronoiGraph.angularDistance(y[0].centroid, x.centroid, 1)] as [[VoronoiCell, [number, number, number]], number]).sort((a, b) => a[1] - b[1]).map(y => y[0])[0];
            const color: [number, number, number] = (colorPair1 ?? colorPair2)[1];
            return [x, color] as [VoronoiCell, [number, number, number]];
        });

        // compute height
        const heightMap = new Map(colors3.map(([x, color]) => [x, color[1] === 1 ? 0 : -1]));
        const heightSet = new Set(Array.from(heightMap).map(x => x[0]));
        for (let i = 0; i < 5; i++) {
            const heightDynamicProgramming = Array.from(heightSet);
            const game = new Game();
            const voronoiTree = new VoronoiTree<Star>(game);
            for (const x of heightDynamicProgramming) {
                const star = new Star(game);
                star.position = Quaternion.fromBetweenVectors([0, 0, 1], x.centroid);
                // @ts-ignore
                star.voronoi = x;
                voronoiTree.addItem(star);
            }
            const minHeight = heightDynamicProgramming.map(x => {
                // @ts-ignore
                const voronoiNeighbors = Array.from(voronoiTree.listItems(x.centroid)).filter(y => VoronoiGraph.angularDistance(x.centroid, y.voronoi.centroid, 1) < 0.075);
                // @ts-ignore
                const neighbors = voronoiNeighbors.map(y => heightMap.get(y.voronoi)).filter(z => isFinite(z) && !isNaN(z));
                return [x, heightMap.get(x) >= 0 ? Math.min(...(neighbors.length ? neighbors : [-1])) + 1 : -(Math.min(2, ...(neighbors.length ? neighbors.map(y => y < 0 ? -y : 0) : [0])) + 1)] as [VoronoiCell, number];
            });
            for (const [x, height] of minHeight) {
                heightMap.set(x, height);
            }
        }
        heightMapData = Array.from(heightMap.entries()).map(([key, value]) => [areaVoronoiCells.indexOf(key), value] as [number, number]);


        // compute height of individual vertex
        const heightVertices = new Array<[[number, number, number], number]>();
        const heightVerticesTreeGame = new Game();
        const heightVerticesTree = new VoronoiTree<Star>(heightVerticesTreeGame);
        heightVerticesTree.defaultRecursionNodeLevels = [20, 5, 5, 5, 5];
        const heightEdges = new Array<[[number, number, number], [number, number, number], number]>();
        const heightEdgesTreeGame = new Game();
        const heightEdgesTree = new VoronoiTree<Star>(heightEdgesTreeGame);
        // load height edges
        for (const [x, height] of heightMap.entries()) {
            for (let i = 0; i < x.vertices.length; i++) {
                const a = x.vertices[i];
                const b = x.vertices[(i + 1) % x.vertices.length];
                const item = [a, b, height] as [[number, number, number], [number, number, number], number];
                const star1 = new Star(heightEdgesTreeGame);
                star1.position = Quaternion.fromBetweenVectors([0, 0, 1], a);
                // @ts-ignore
                star1.data = item;
                heightEdgesTree.addItem(star1);
                const star2 = new Star(heightEdgesTreeGame);
                star2.position = Quaternion.fromBetweenVectors([0, 0, 1], b);
                // @ts-ignore
                star2.data = item;
                heightEdgesTree.addItem(star2);
                heightEdges.push(item);
            }
        }
        for (const [x, height] of heightMap.entries()) {
            const insertHeightItem = (vertex: [number, number, number]) => {
                // @ts-ignore
                const heightVertexItem = Array.from(heightVerticesTree.listItems(vertex, Math.PI / 32)).map(star => star.data).find((item) => VoronoiGraph.angularDistance(item[0], vertex, 1) < 0.00001);
                // @ts-ignore
                const heightEdgeItem = Array.from(heightEdgesTree.listItems(vertex, Math.PI / 4)).map(star => star.data).find((item) => VoronoiGraph.angularDistance(item[0], vertex, 1) + VoronoiGraph.angularDistance(item[1], vertex, 1) < VoronoiGraph.angularDistance(item[0], item[1], 1) + 0.00001);
                // max height of shared vertex
                if (heightVertexItem && height > heightVertexItem[1]) {
                    heightVertexItem[1] = height;
                }
                if (heightVertexItem && heightEdgeItem && heightEdgeItem[2] > heightVertexItem[1]) {
                    heightVertexItem[1] = heightEdgeItem[2];
                }
                if (!heightVertexItem && heightEdgeItem) {
                    const item = [[vertex[0], vertex[1], vertex[2]], heightEdgeItem[2]] as [[number, number, number], number];
                    const star = new Star(heightVerticesTreeGame);
                    star.position = Quaternion.fromBetweenVectors([0, 0, 1], vertex);
                    // @ts-ignore
                    star.data = item;
                    heightVerticesTree.addItem(star);
                    heightVertices.push(item);
                }
                // new item
                if (!heightVertexItem && !heightEdgeItem) {
                    const item = [[vertex[0], vertex[1], vertex[2]], height] as [[number, number, number], number];
                    const star = new Star(heightVerticesTreeGame);
                    star.position = Quaternion.fromBetweenVectors([0, 0, 1], vertex);
                    // @ts-ignore
                    star.data = item;
                    heightVerticesTree.addItem(star);
                    heightVertices.push(item);
                }
            }
            // for each edge vertex
            for (const vertex of x.vertices) {
                insertHeightItem(vertex);
            }

            // for each centroid
            const centroid = x.centroid;
            insertHeightItem(centroid);
        }

        // modify areaVoronoiCells with new heights
        for (const voronoi of areaVoronoiCells) {
            const modifyVertex = (vertex: [number, number, number]) => {
                // @ts-ignore
                const arr = Array.from(heightVerticesTree.listItems(vertex, Math.PI / 32)).map(star => star.data);
                let heightItem = arr.find((item => VoronoiGraph.angularDistance(item[0], vertex, 1) < 0.00001));
                if (!heightItem && arr[0]) {
                    heightItem = arr.find((item => VoronoiGraph.angularDistance(item[0], vertex, 1) < 0.001));
                }
                if (!heightItem && arr[0]) {
                    heightItem = arr.find((item => VoronoiGraph.angularDistance(item[0], vertex, 1) < 0.1));
                }
                if (!heightItem && arr[0]) {
                    heightItem = arr[0];
                }
                if (!heightItem) {
                    heightItem = [[vertex[0], vertex[1], vertex[2]], 0];
                }
                const output = DelaunayGraph.normalize(vertex);
                output[0] *= heightItem[1] * 0.02 + 1;
                output[1] *= heightItem[1] * 0.02 + 1;
                output[2] *= heightItem[1] * 0.02 + 1;
                return output;
            };
            voronoi.centroid = modifyVertex(voronoi.centroid);
            voronoi.vertices = voronoi.vertices.map(modifyVertex);
        }

        // modify walkingVoronoiCells height
        const areaVoronoiCellsTreeGame = new Game();
        const areaVoronoiCellsTree = new VoronoiTree<Star>(areaVoronoiCellsTreeGame);
        areaVoronoiCellsTree.defaultRecursionNodeLevels = [20, 5, 5, 5, 5];
        for (const x of areaVoronoiCells) {
            const star = new Star(areaVoronoiCellsTreeGame);
            star.position = Quaternion.fromBetweenVectors([0, 0, 1], x.centroid);
            // @ts-ignore
            star.data = x;
            areaVoronoiCellsTree.addItem(star);
        }
        for (const voronoi of walkingVoronoiCells) {
            // @ts-ignore
            const arr = Array.from(areaVoronoiCellsTree.listItems(voronoi.centroid, Math.PI / 32)).map(star => star.data);
            let area = arr.find((item) => item.containsPoint(voronoi.centroid));
            if (!area) {
                area = areaVoronoiCells.find((item) => item.containsPoint(voronoi.centroid));
            }
            if (!area) {
                area = areaVoronoiCells[0];
            }
            if (!area) {
                throw new Error("Could not find area voronoi cell for plane ray intersection");
            }
            const modifyVertex = (vertex: [number, number, number]) => {
                if (!area) {
                    throw new Error("Failed to find height item");
                }
                const findPlane = () => {
                    // for each pair of vertices
                    for (let i = 0; i < area.vertices.length; i++) {
                        // test line segment and point
                        const a = area.vertices[i % area.vertices.length];
                        const b = area.vertices[(i + 1) % area.vertices.length];
                        const c = area.centroid;
                        const testSegment = () => {
                            const pairs = [[a, b], [b, c], [c, a]];
                            for (const [p, q] of pairs) {
                                const testPair = () => {
                                    const n = DelaunayGraph.normalize(DelaunayGraph.crossProduct(p, q));
                                    const v = DelaunayGraph.dotProduct(n, vertex);
                                    return v >= 0;
                                };
                                if (!testPair()) {
                                    return false;
                                }
                            }
                            return true;
                        };
                        if (testSegment()) {
                            return [
                                DelaunayGraph.normalize(DelaunayGraph.crossProduct(DelaunayGraph.subtract(a, c), DelaunayGraph.subtract(b, c))),
                                c
                            ];
                        }
                    }
                    throw new Error("Could not find segment of voronoi to test for height");
                };
                const [planeNormal, planePoint] = findPlane();
                const rayDirection = DelaunayGraph.add(vertex, vertex);
                rayDirection[0] *= -1;
                rayDirection[1] *= -1;
                rayDirection[2] *= -1;
                const rayOrigin = DelaunayGraph.add(vertex, vertex);
                const denom = DelaunayGraph.dotProduct(planeNormal, rayDirection);
                if (Math.abs(denom) < 0.00001) {
                    throw new Error("Could not find correct angle plane for test of height");
                }
                const t = DelaunayGraph.dotProduct(DelaunayGraph.subtract(vertex, rayOrigin), planeNormal) / denom;
                if (t < 0) {
                    throw new Error("Could not find correct distance from plane for test of height");
                }
                const tLength = DelaunayGraph.add(rayDirection, [0, 0, 0]);
                tLength[0] *= t;
                tLength[1] *= t;
                tLength[2] *= t;
                const point = DelaunayGraph.add(rayOrigin, tLength);
                const height = DelaunayGraph.distanceFormula(point, [0, 0, 0]);
                const output = DelaunayGraph.normalize(vertex);
                output[0] *= height;
                output[1] *= height;
                output[2] *= height;
                return output;
            };
            voronoi.centroid = modifyVertex(voronoi.centroid);
            voronoi.vertices = voronoi.vertices.map(modifyVertex);
        }

        // compute color from height
        colors3 = colors3.map(([x, color]) => {
            const height = heightMap.get(x);
            if (height >= 0) {
                const newColor = [color[0], color[1] - height / 5.0 * 0.66, color[2]];
                return [x, newColor] as [VoronoiCell, [number, number, number]];
            } else if (height < 0) {
                const newColor = [color[0] + (3.0 + height) / 10.0 * 0.66, color[1] + (3.0 + height) / 10.0 * 0.66, color[2]];
                return [x, newColor] as [VoronoiCell, [number, number, number]];
            }
        });
        colorData = Array.from(colors3.entries()).map(([key, value]) => [areaVoronoiCells.indexOf(value[0]), value[1]] as [number, [number, number, number]]);
        const colors4 = walkingVoronoiCells.map((x) => {
            const colorPair1 = colors3.find(item => item[0].containsPoint(x.centroid));
            const colorPair2 = colorPair1 ? null : colors3.map((y) => [y, VoronoiGraph.angularDistance(y[0].centroid, x.centroid, 1)] as [[VoronoiCell, [number, number, number]], number]).sort((a, b) => a[1] - b[1]).map(y => y[0])[0];
            const color: [number, number, number] = (colorPair1 ?? colorPair2)[1];
            const newColor = [color[0] * (game.seedRandom.double() * 0.1 + 0.9), color[1] * (game.seedRandom.double() * 0.1 + 0.9), color[2] * (game.seedRandom.double() * 0.1 + 0.9)];
            return [x, newColor] as [VoronoiCell, [number, number, number]];
        });

        // generate mesh
        generateMesh(walkingVoronoiCells, colors4);
    }

    return {
        meshes,
        voronoiTerrain: voronoiTree?.serializeTerrainPlanet(),
        colorData,
        heightMapData,
        buildings,
        spawnPoints,
    };
}

export const generatePlanet = (level: number, seed: string, breakApart: boolean): {meshes: IGameMesh[], voronoiTerrain: ISerializedTree, heightMapData: [number, number][] | null} => {
    const game: Game = new Game();
    game.seedRandom = seedrandom(`${seed}-level1`);
    const planetVoronoiCells = game.generateGoodPoints(100, 10);
    let voronoiTerrain: VoronoiTerrain;

    let combinedVoronoiCells: VoronoiCell[] | undefined;
    if (level >= 1) {
        game.seedRandom = seedrandom(`${seed}-level2`);
        const offsetVoronoiCells = game.generateGoodPoints(100, 10);
        voronoiTerrain = new VoronoiTerrain(game);
        voronoiTerrain.setRecursionNodeLevels([10, 10, 10]);
        voronoiTerrain.nodes = offsetVoronoiCells.map(x => new VoronoiTreeNode<any>(game, x, 1, voronoiTerrain));
        voronoiTerrain.generateTerrainPlanet(0, 2);
        combinedVoronoiCells = voronoiTerrain.nodes.reduce((acc, x) => [
            ...acc,
            ...x.nodes.reduce((acc2, y) => [
                ...acc2,
                y.voronoiCell
            ], [] as VoronoiCell[])
        ], [] as VoronoiCell[]);
    }

    let combinedVoronoiCells2: VoronoiCell[] | undefined;
    if (level >= 2) {
        game.seedRandom = seedrandom(`${seed}-level3`);
        const offsetVoronoiCells2 = game.generateGoodPoints(100, 10);
        voronoiTerrain = new VoronoiTerrain(game);
        voronoiTerrain.setRecursionNodeLevels([10, 10, 10]);
        voronoiTerrain.nodes = offsetVoronoiCells2.map(x => new VoronoiTreeNode<any>(game, x, 1, voronoiTerrain));
        voronoiTerrain.generateTerrainPlanet(0, 3);
        combinedVoronoiCells2 = voronoiTerrain.nodes.reduce((acc, x) => [
            ...acc,
            ...x.nodes.reduce((acc2, y) => [
                ...acc2,
                ...y.nodes.reduce((acc3, z) => [
                    ...acc3,
                    z.voronoiCell
                ], [] as VoronoiCell[])
            ], [] as VoronoiCell[])
        ], [] as VoronoiCell[]);5
    }

    let combinedVoronoiCells3: VoronoiCell[] | undefined;
    if (level >= 3) {
        game.seedRandom = seedrandom(`${seed}-level4`);
        const offsetVoronoiCells3 = game.generateGoodPoints(100, 10);
        voronoiTerrain = new VoronoiTerrain(game);
        voronoiTerrain.setRecursionNodeLevels([10, 10, 10, 100]);
        voronoiTerrain.nodes = offsetVoronoiCells3.map(x => new VoronoiTreeNode<any>(game, x, 1, voronoiTerrain));
        voronoiTerrain.generateTerrainPlanet(0, 4);
        combinedVoronoiCells3 = voronoiTerrain.nodes.reduce((acc, x) => [
            ...acc,
            ...x.nodes.reduce((acc2, y) => [
                ...acc2,
                ...y.nodes.reduce((acc3, z) => [
                    ...acc3,
                    ...z.nodes.reduce((acc4, w) => [
                        ...acc4,
                        w.voronoiCell
                    ], [] as VoronoiCell[])
                ], [] as VoronoiCell[])
            ], [] as VoronoiCell[])
        ], [] as VoronoiCell[]);
    }

    game.seedRandom = seedrandom(`${seed}-mesh-gen`);
    return generatePlanetMesh(game, voronoiTerrain, planetVoronoiCells, combinedVoronoiCells, combinedVoronoiCells2, combinedVoronoiCells3, breakApart);
};

export const generatePlanetSteps = (): IGameMesh[] => {
    const meshes: IGameMesh[] = [];
    const game: Game = new Game();
    let delaunayGraph: DelaunayGraph<any> = new DelaunayGraph<ICameraState>(game);
    for (let i = 0; i < 10; i++) {
        const lloydPoints = i === 0 ? game.generateGoodPointsStart<ICameraState>(100) : game.generateGoodPointsContinue<ICameraState>(100, delaunayGraph);
        delaunayGraph = new DelaunayGraph<ICameraState>(game);
        delaunayGraph.initializeWithPoints(lloydPoints);
        const planetVoronoiCells = game.generateGoodPointsEnd<ICameraState>(100, delaunayGraph);
        meshes.push(generatePlanetMesh(game, new VoronoiTerrain(game), planetVoronoiCells, undefined, undefined, undefined,false).meshes[0]);
    }
    return meshes;
};

export const generatePlanetGltf = async (data: IGameMesh, isOcean: boolean, isNavMesh: boolean): Promise<Uint8Array> => {
    const doc = new GltfDocument();
    const scene = doc.createScene();
    const node = doc.createNode("planet");
    scene.addChild(node);

    const buffer = doc.createBuffer();
    const indexAccessor = doc.createAccessor("index")
        .setArray(new Uint32Array(data.index))
        .setType(Accessor.Type.SCALAR)
        .setBuffer(buffer);
    const positionAccessor = doc.createAccessor("aPosition")
        .setArray(new Float32Array(data.attributes.find(x => x.id === "aPosition")!.buffer))
        .setType(Accessor.Type.VEC3)
        .setBuffer(buffer);

    let colorAccessor: Accessor | null = null;
    if (data.attributes.find(x => x.id === "aColor")) {
        colorAccessor = doc.createAccessor("aColor")
            .setArray(new Float32Array(data.attributes.find(x => x.id === "aColor")!.buffer))
            .setType(Accessor.Type.VEC3)
            .setBuffer(buffer);
    }

    let normalAccessor: Accessor | null = null;
    if (data.attributes.find(x => x.id === "aNormal")) {
        normalAccessor = doc.createAccessor("aNormal")
            .setArray(new Float32Array(data.attributes.find(x => x.id === "aNormal")!.buffer))
            .setType(Accessor.Type.VEC3)
            .setBuffer(buffer);
    }
    const primitive = doc.createPrimitive()
        .setIndices(indexAccessor)
        .setAttribute("POSITION", positionAccessor);
    if (colorAccessor) {
        primitive.setAttribute("COLOR_0", colorAccessor);
    }
    if (normalAccessor) {
        primitive.setAttribute("NORMAL", normalAccessor);
    }
    const material = doc.createMaterial().setDoubleSided(true);
    if (isOcean) {
        material.setBaseColorFactor([0.3, 0.3, 1.0, 0.8]).setAlphaMode("BLEND").setAlpha(0.8);
    }
    if (isNavMesh) {
        material.setBaseColorFactor([0.0, 0.0, 0.0, 0.0]).setAlphaMode("BLEND").setAlpha(0.0);
    }
    primitive.setMaterial(material);
    const mesh = doc.createMesh("planet");
    mesh.addPrimitive(primitive);
    node.setMesh(mesh);

    return await new WebIO().writeBinary(doc);
};