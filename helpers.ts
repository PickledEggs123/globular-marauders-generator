import {ICameraState, IGameMesh} from "@pickledeggs123/globular-marauders-game/lib/src/Interface";
import {Game, Star, VoronoiTerrain} from "@pickledeggs123/globular-marauders-game/lib/src";
import {Accessor, Document as GltfDocument, WebIO} from "@gltf-transform/core";
import {VoronoiCell, VoronoiGraph} from "@pickledeggs123/globular-marauders-game/lib/src/Graph";
import {DelaunayGraph} from "@pickledeggs123/globular-marauders-game/lib/src/Graph";
import {
    ISerializedTree,
    ISerializedVoronoiTerrain,
    VoronoiTree,
    VoronoiTreeNode
} from "@pickledeggs123/globular-marauders-game/lib/src/VoronoiTree";
import * as Quaternion from "quaternion";
import seedrandom from "seedrandom";

export const generatePlanetMesh = (game: Game, voronoiTree: VoronoiTerrain, planetVoronoiCells: VoronoiCell[], biomeVoronoiCells: VoronoiCell[] | undefined = undefined, areaVoronoiCells: VoronoiCell[] | undefined = undefined, walkingVoronoiCells: VoronoiCell[] | undefined = undefined) => {
    let planetGeometryData: {position: number[], color: number[], normal: number[], index: number[]};
    let heightMapData: [number, number][] | null = null;
    let colorData: [number, [number, number, number]][] | null = null;
    const generateMesh = (voronoiCells: VoronoiCell[], colors: [VoronoiCell, [number, number, number]][]) => {
        return voronoiCells.reduce((acc, v, index) => {
            // color of voronoi tile
            const color: [number, number, number] = colors[index][1];

            // initial center index
            const startingIndex = acc.index.reduce((acc, a) => Math.max(acc, a + 1), 0);
            acc.position.push.apply(acc.position, v.centroid);
            acc.color.push.apply(acc.color, color);
            acc.normal.push.apply(acc.normal, v.centroid);

            for (let i = 0; i < v.vertices.length; i++) {
                // vertex data
                const a = v.vertices[i % v.vertices.length];
                acc.position.push.apply(acc.position, a);
                acc.color.push.apply(acc.color, color);
                acc.normal.push.apply(acc.normal, a);

                // triangle data
                acc.index.push(
                    startingIndex,
                    startingIndex + (i % v.vertices.length) + 1,
                    startingIndex + ((i + 1) % v.vertices.length) + 1
                );
            }
            return acc;
        }, {
            position: [],
            color: [],
            normal: [],
            index: []
        } as { position: number[], color: number[], normal: number[], index: number[] });
    }
    const colors = planetVoronoiCells.map((x) => {
        const color: [number, number, number] = game.seedRandom.double() > 0.33 ? [0.33, 0.33, 1] : [0.33, 1, 0.33];
        return [x, color] as [VoronoiCell, [number, number, number]];
    });
    if (!biomeVoronoiCells && !areaVoronoiCells && !walkingVoronoiCells) {
        planetGeometryData = generateMesh(planetVoronoiCells, colors);
    } else if (!areaVoronoiCells && !walkingVoronoiCells) {
        const colors2 = biomeVoronoiCells.map((x) => {
            const colorPair1 = colors.find(item => item[0].containsPoint(x.centroid));
            const colorPair2 = colorPair1 ? null : colors.map((y) => [y, VoronoiGraph.angularDistance(y[0].centroid, x.centroid, 1)] as [[VoronoiCell, [number, number, number]], number]).sort((a, b) => a[1] - b[1]).map(y => y[0])[0];
            const color: [number, number, number] = (colorPair1 ?? colorPair2)[1];
            return [x, color] as [VoronoiCell, [number, number, number]];
        });
        planetGeometryData = generateMesh(biomeVoronoiCells, colors2);
    } else if (!walkingVoronoiCells) {
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
        planetGeometryData = generateMesh(areaVoronoiCells, colors3);
    } else {
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
        planetGeometryData = generateMesh(walkingVoronoiCells, colors4);
    }

    return {
        mesh: {
            attributes: [{
                id: "aPosition", buffer: planetGeometryData.position, size: 3
            }, {
                id: "aColor", buffer: planetGeometryData.color, size: 3
            }, {
                id: "aNormal", buffer: planetGeometryData.normal, size: 3
            }],
            index: planetGeometryData.index
        } as IGameMesh,
        voronoiTerrain: voronoiTree?.serializeTerrainPlanet(),
        colorData,
        heightMapData
    };
}

export const generatePlanet = (level: number, seed: string): {mesh: IGameMesh, voronoiTerrain: ISerializedTree, heightMapData: [number, number][] | null} => {
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
        ], [] as VoronoiCell[]);
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
    return generatePlanetMesh(game, voronoiTerrain, planetVoronoiCells, combinedVoronoiCells, combinedVoronoiCells2, combinedVoronoiCells3);
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
        meshes.push(generatePlanetMesh(game, new VoronoiTerrain(game), planetVoronoiCells).mesh);
    }
    return meshes;
};

export const generatePlanetGltf = async (data: IGameMesh): Promise<Uint8Array> => {
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
    const colorAccessor = doc.createAccessor("aColor")
        .setArray(new Float32Array(data.attributes.find(x => x.id === "aColor")!.buffer))
        .setType(Accessor.Type.VEC3)
        .setBuffer(buffer);
    const normalAccessor = doc.createAccessor("aNormal")
        .setArray(new Float32Array(data.attributes.find(x => x.id === "aNormal")!.buffer))
        .setType(Accessor.Type.VEC3)
        .setBuffer(buffer);
    const primitive = doc.createPrimitive()
        .setIndices(indexAccessor)
        .setAttribute("POSITION", positionAccessor)
        .setAttribute("COLOR_0", colorAccessor)
        .setAttribute("NORMAL", normalAccessor)
        .setMaterial(doc.createMaterial().setDoubleSided(true));
    const mesh = doc.createMesh("planet");
    mesh.addPrimitive(primitive);
    node.setMesh(mesh);

    return await new WebIO().writeBinary(doc);
};