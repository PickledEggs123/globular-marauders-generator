import { program } from "commander";
import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";
import {Game} from "@pickledeggs123/globular-marauders-game/lib/src";
import {IGameMesh} from "@pickledeggs123/globular-marauders-game/lib/src/Interface";

program.command("mesh")
    .description("generate a planet mesh")
    .argument("type", "the type of data to create")
    .argument("destination", "the output file")
    .action(async (type, destination) => {
        if (type === "planet") {
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

            const data: IGameMesh = {
                attributes: [{
                    id: "aPosition", buffer: planetGeometryData.position, size: 3
                }, {
                    id: "aColor", buffer: planetGeometryData.color, size: 3
                }],
                index: planetGeometryData.index
            };

            await fs.promises.writeFile(destination, JSON.stringify(data), {encoding: "utf8"});
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