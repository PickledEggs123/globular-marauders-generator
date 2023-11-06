import {ICameraState, IGameMesh} from "@pickledeggs123/globular-marauders-game/lib/src/Interface";
import {Game, Star, VoronoiTerrain} from "@pickledeggs123/globular-marauders-game/lib/src";
import {Accessor, Document as GltfDocument, WebIO} from "@gltf-transform/core";
import {VoronoiCell, VoronoiGraph} from "@pickledeggs123/globular-marauders-game/lib/src/Graph";
import {DelaunayGraph} from "@pickledeggs123/globular-marauders-game/lib/src/Graph";
import {VoronoiTree, VoronoiTreeNode} from "@pickledeggs123/globular-marauders-game/lib/src/VoronoiTree";
import * as Quaternion from "quaternion";

export const generatePlanetMesh = (planetVoronoiCells: VoronoiCell[], biomeVoronoiCells: VoronoiCell[] = undefined, areaVoronoiCells: VoronoiCell[] = undefined) => {
    let planetGeometryData: {position: number[], color: number[], normal: number[], index: number[]};
    if (!biomeVoronoiCells && !areaVoronoiCells) {
        planetGeometryData = planetVoronoiCells.reduce((acc, v) => {
            // color of voronoi tile
            const color: [number, number, number] = Math.random() > 0.33 ? [0.33, 0.33, 1] : [0.33, 1, 0.33];

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
    } else if (!areaVoronoiCells) {
        const colors = planetVoronoiCells.map((x) => {
            const color: [number, number, number] = Math.random() > 0.33 ? [0.33, 0.33, 1] : [0.33, 1, 0.33];
            return [x, color] as [VoronoiCell, [number, number, number]];
        });
        planetGeometryData = biomeVoronoiCells.reduce((acc, v) => {
            // color of voronoi tile
            const color: [number, number, number] = colors.find((item) => item[0].containsPoint(v.centroid))[1];

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
    } else {
        const colors = planetVoronoiCells.map((x) => {
            const color: [number, number, number] = Math.random() > 0.33 ? [0.33, 0.33, 1] : [0.33, 1, 0.33];
            return [x, color] as [VoronoiCell, [number, number, number]];
        });
        const colors2 = biomeVoronoiCells.map((x) => {
            const color: [number, number, number] = colors.find((item) => item[0].containsPoint(x.centroid))[1];
            return [x, color] as [VoronoiCell, [number, number, number]];
        });
        let colors3 = areaVoronoiCells.map((x, i) => {
            const color: [number, number, number] = colors2.find((item) => item[0].containsPoint(x.centroid))[1];
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
                const neightbors = voronoiNeighbors.map(y => heightMap.get(y.voronoi)).filter(z => isFinite(z) && !isNaN(z));
                return [x, heightMap.get(x) >= 0 ? Math.min(...(neightbors.length ? neightbors : [-1])) + 1 : -1] as [VoronoiCell, number];
            });
            for (const [x, height] of minHeight) {
                heightMap.set(x, height);
            }
        }
        colors3 = colors3.map(([x, color]) => {
            const height = heightMap.get(x);
            if (height >= 0) {
                const newColor = [color[0], color[1] - height / 5.0 * 0.66, color[2]];
                return [x, newColor] as [VoronoiCell, [number, number, number]];
            }
            return [x, color] as [VoronoiCell, [number, number, number]];
        });
        planetGeometryData = areaVoronoiCells.reduce((acc, v, index) => {
            // color of voronoi tile
            const color = colors3[index][1];

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

    return {
        attributes: [{
            id: "aPosition", buffer: planetGeometryData.position, size: 3
        }, {
            id: "aColor", buffer: planetGeometryData.color, size: 3
        }, {
            id: "aNormal", buffer: planetGeometryData.normal, size: 3
        }],
        index: planetGeometryData.index
    };
}

export const generatePlanet = (): IGameMesh => {
    const game: Game = new Game();
    const planetVoronoiCells = game.generateGoodPoints(100, 10);

    const offsetVoronoiCells = game.generateGoodPoints(100, 10);
    const voronoiTerrain = new VoronoiTerrain(game);
    voronoiTerrain.setRecursionNodeLevels([10, 10, 10]);
    voronoiTerrain.nodes = offsetVoronoiCells.map(x => new VoronoiTreeNode<any>(game, x, 1, voronoiTerrain));
    voronoiTerrain.generateTerrainPlanet(0, 2);
    const combinedVoronoiCells = voronoiTerrain.nodes.reduce((acc, x) => [
        ...acc,
        ...x.nodes.reduce((acc2, y) => [
            ...acc2,
            y.voronoiCell
        ], [] as VoronoiCell[])
    ], [] as VoronoiCell[]);

    const offsetVoronoiCells2 = game.generateGoodPoints(100, 10);
    const voronoiTerrain2 = new VoronoiTerrain(game);
    voronoiTerrain2.setRecursionNodeLevels([10, 10, 10]);
    voronoiTerrain2.nodes = offsetVoronoiCells2.map(x => new VoronoiTreeNode<any>(game, x, 1, voronoiTerrain2));
    voronoiTerrain2.generateTerrainPlanet(0, 3);
    const combinedVoronoiCells2 = voronoiTerrain2.nodes.reduce((acc, x) => [
        ...acc,
        ...x.nodes.reduce((acc2, y) => [
            ...acc2,
            ...y.nodes.reduce((acc3, z) => [
                ...acc3,
                z.voronoiCell
            ], [] as VoronoiCell[])
        ], [] as VoronoiCell[])
    ], [] as VoronoiCell[]);

    return generatePlanetMesh(planetVoronoiCells, combinedVoronoiCells, combinedVoronoiCells2);
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
        meshes.push(generatePlanetMesh(planetVoronoiCells));
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