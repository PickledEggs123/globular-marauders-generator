import {IGameMesh} from "@pickledeggs123/globular-marauders-game/lib/src/Interface";
import {Game} from "@pickledeggs123/globular-marauders-game/lib/src";
import {Accessor, Document as GltfDocument, WebIO} from "@gltf-transform/core";

export const generatePlanet = (): IGameMesh => {
    const game: Game = new Game();
    const planetVoronoiCells = game.generateGoodPoints(100, 10);
    const planetGeometryData = planetVoronoiCells.reduce((acc, v) => {
        // color of voronoi tile
        const color: [number, number, number] = Math.random() > 0.33 ? [0.33, 0.33, 1] : [0.33, 1, 0.33];

        // initial center index
        const startingIndex = acc.index.reduce((acc, a) => Math.max(acc, a + 1), 0);
        acc.position.push.apply(acc.position, v.centroid);
        acc.color.push.apply(acc.color, color);

        for (let i = 0; i < v.vertices.length; i++) {
            // vertex data
            const a = v.vertices[i % v.vertices.length];
            acc.position.push.apply(acc.position, a);
            acc.color.push.apply(acc.color, color);

            // triangle data
            acc.index.push(
                startingIndex,
                startingIndex + (i % v.vertices.length) + 1,
                startingIndex + ((i + 1) % v.vertices.length) + 1
            );
        }
        return acc;
    }, {position: [], color: [], index: []} as { position: number[], color: number[], index: number[] });

    return {
        attributes: [{
            id: "aPosition", buffer: planetGeometryData.position, size: 3
        }, {
            id: "aColor", buffer: planetGeometryData.color, size: 3
        }],
        index: planetGeometryData.index
    };
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
    const colorAccessor = doc.createAccessor("aPosition")
        .setArray(new Float32Array(data.attributes.find(x => x.id === "aColor")!.buffer))
        .setType(Accessor.Type.VEC3)
        .setBuffer(buffer);
    const primitive = doc.createPrimitive()
        .setIndices(indexAccessor)
        .setAttribute("POSITION", positionAccessor)
        .setAttribute("COLOR_0", colorAccessor)
        .setMaterial(doc.createMaterial().setDoubleSided(true));
    const mesh = doc.createMesh("planet");
    mesh.addPrimitive(primitive);
    node.setMesh(mesh);

    return await new WebIO().writeBinary(doc);
};