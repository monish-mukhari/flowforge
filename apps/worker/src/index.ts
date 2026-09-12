require("dotenv").config();

import { Kafka } from 'kafkajs';
import prisma from "@repo/db/client";
import { JsonObject } from "@prisma/client/runtime/library";
import { parse } from './parser';
import { sendSol } from './solana';
import { sendEmail } from './email';

const TOPIC_NAME = 'zap-events';

const kafka = new Kafka({
    clientId: 'worker',
    brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
});

async function main() {
    const consumer = kafka.consumer({ groupId: 'main-worker-2' });
    await consumer.connect();
    await consumer.subscribe({ topic: TOPIC_NAME});

    const producer = kafka.producer();
    await producer.connect();
    
    await consumer.run({
        autoCommit: false,
        eachMessage: async ({ topic, partition, message }) => {
            console.log({
                partition,
                offset: message.offset,
                value: message.value?.toString(),
            });

            if(!message.value?.toString()) {
                return;
            }

            const parsedValue = JSON.parse(message.value?.toString());
            const zapRunId = parsedValue.zapRunId;
            const stage = parsedValue.stage;
            const zapRunDetails = await prisma.zapRun.findFirst({
                where: {
                    id: zapRunId
                },
                include: {
                    zap: {
                        include: {
                            actions: {
                                include: {
                                    type: true
                                }
                            }
                        }
                    }
                }
            });

            const currentAction = zapRunDetails?.zap.actions.find(x => x.sortingOrder === stage);
            
            if(!currentAction) {
                console.log("Current action not found?");
                return;
            }

            const zapRunMetadata = zapRunDetails?.metadata;


            if(currentAction.type.id === "email") {
                const body = parse((currentAction.metadata as JsonObject)?.body as string, zapRunMetadata);
                const to = parse((currentAction.metadata as JsonObject)?.email as string, zapRunMetadata);
                console.log(`Sending out email to ${to} body is ${body}`);   
                await sendEmail(to, body);
            }

            if(currentAction.type.id === "solana") {
                const amount = parse((currentAction.metadata as JsonObject)?.amount as string, zapRunMetadata)
                const address = parse((currentAction.metadata as JsonObject)?.address as string, zapRunMetadata);
                console.log(`Sending out SOL of ${amount} to address ${address}`)
                await sendSol(address, amount);
            }

            const lastStage = (zapRunDetails?.zap.actions.length || 1) - 1;
            if(lastStage != stage) {
                await producer.send({
                    topic: TOPIC_NAME,
                    messages: [{
                        value: JSON.stringify({
                            stage: stage + 1,
                            zapRunId
                        })
                    }]
                })
            }



            console.log("message processed");

            await consumer.commitOffsets([{
                topic,
                partition,
                offset: (parseInt(message.offset) + 1).toString()
            }])
        }
    })
    
}

main();
