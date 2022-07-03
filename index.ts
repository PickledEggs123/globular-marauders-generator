import {program} from "commander";
import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";
import {generatePlanet, generatePlanetGltf} from "./helpers";
import {IGameMesh} from "@pickledeggs123/globular-marauders-game/lib/src/Interface";
import {NodeIO, Primitive} from '@gltf-transform/core';

program.command("mesh")
    .description("generate a planet mesh")
    .argument("type", "the type of data to create")
    .argument("destination", "the output file")
    .action(async (type, destination) => {
        if (type === "planet") {
            const data = generatePlanet();
            await fs.promises.writeFile(destination, JSON.stringify(data), {encoding: "utf8"});
        } else {
            throw new Error("Can only generate ['Planet'] mesh");
        }
    });

program.command("convert-mesh")
    .description("generate a ship mesh")
    .argument("type", "the type of data to create")
    .argument("source", "the source file to convert")
    .argument("destination", "the output file")
    .action(async (type, source, destination) => {
        if (type === "ship") {
            // open document
            const io = new NodeIO();
            const document = await io.read(source);

            // extract index and position
            let indexOffset = 0;
            const index: number[] = [];
            const position: number[] = [];
            const color: number[] = [];

            // parse data from gltf
            for (const node of document.getRoot().getDefaultScene().listChildren()) {
                const mesh = node.getMesh();
                if (mesh) {
                    for (const primitive of mesh.listPrimitives()) {
                        const indices = primitive.getIndices();
                        const material = primitive.getMaterial();
                        const rgb = material.getBaseColorFactor();
                        switch (primitive.getMode()) {
                            case Primitive.Mode.TRIANGLES: {
                                const attributes = primitive.listAttributes();
                                const iData = indices.getArray() as Uint32Array;
                                const pData = attributes[0].getArray() as Float32Array;
                                let numVertices = 0;
                                for (let i = 0; i < iData.length; i += 3) {
                                    index.push(iData[i] + indexOffset, iData[i + 1] + indexOffset, iData[i + 2] + indexOffset);
                                }
                                for (let i = 0; i < pData.length; i += 3) {
                                    position.push(pData[i], pData[i + 1], pData[i + 2]);
                                    color.push(...rgb.slice(0, 3));
                                    numVertices += 1;
                                }
                                indexOffset += numVertices;
                                break;
                            }
                        }
                    }
                }
            }

            // save data
            const data: IGameMesh = {
                attributes: [{
                    id: "aPosition", buffer: position, size: 3
                }, {
                    id: "aColor", buffer: color, size: 3
                }],
                index
            };
            await fs.promises.writeFile(destination, JSON.stringify(data), {encoding: "utf8"});
        } else {
            throw new Error("Can only generate ['Ship'] mesh");
        }
    });

program.command("mesh-gltf")
    .description("generate a planet mesh")
    .argument("type", "the type of data to create")
    .argument("destination", "the output file")
    .action(async (type, destination) => {
        if (type === "planet") {
            const data = generatePlanet();
            const json = await generatePlanetGltf(data);
            await fs.promises.writeFile(destination, json);
        } else {
            throw new Error("Can only generate ['Planet'] mesh");
        }
    });

program.command("image")
    .description("generate an image from a mesh")
    .argument("type", "the type of data to render")
    .argument("source", "the input file")
    .action(async (type, source) => {
        if (type === "planet") {
            const data = JSON.parse(await fs.promises.readFile(source, {encoding: "utf8"}));

            const browser = await puppeteer.launch({defaultViewport: {width: 256, height: 256}});
            const page = await browser.newPage();
            const pageContent = await fs.promises.readFile("./pixi/pixi-renderer.html", "utf8");
            await page.setContent(pageContent);
            await page.evaluate((data) => {
                // @ts-ignore
                loadPlanet(data);
            }, data);
            await new Promise<void>((resolve) => {
                setTimeout(() => {
                    resolve();
                }, 1000);
            });
            await page.screenshot({ path: `${path.basename(source, path.extname(source))}.jpeg`, type: "jpeg" });
            await browser.close();
        } else if (type === "ship") {
            const data = JSON.parse(await fs.promises.readFile(source, {encoding: "utf8"}));

            const browser = await puppeteer.launch({defaultViewport: {width: 256, height: 256}});
            const page = await browser.newPage();
            const pageContent = await fs.promises.readFile("./pixi/pixi-renderer.html", "utf8");
            await page.setContent(pageContent);
            await page.evaluate((data) => {
                // @ts-ignore
                loadShip(data);
            }, data);
            await new Promise<void>((resolve) => {
                setTimeout(() => {
                    resolve();
                }, 1000);
            });
            await page.screenshot({ path: `${path.basename(source, path.extname(source))}.jpeg`, type: "jpeg" });
            await browser.close();
        } else {
            throw new Error("Can only render ['Planet'] image");
        }
    });

program.command("embed")
    .description("embed an image into a mesh")
    .argument("type", "the type of data to embed")
    .argument("source", "the input file")
    .action(async (type, source) => {
        if (type === "planet") {
            const data = JSON.parse(await fs.promises.readFile(source, {encoding: "utf8"}));
            const image = await fs.promises.readFile(`${path.basename(source, path.extname(source))}.jpeg`);
            data.image = `data:image/jpeg;base64,${Buffer.from(image).toString("base64")}`;
            await fs.promises.writeFile(source, JSON.stringify(data), {encoding: "utf8"});
        } else {
            throw new Error("Can only embed ['Planet'] image");
        }
    });

program.parse();