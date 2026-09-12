import express from 'express';
import prisma from '@repo/db/client';

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok", service: "hooks" }));

app.post("/hooks/catch/:userId/:zapId", async (req, res): Promise<any> => {
    const userId = Number(req.params.userId);
    const zapId = req.params.zapId;
    const body = req.body;

    const zap = await prisma.zap.findFirst({ where: { id: zapId, userId }, select: { id: true } });
    if (!zap) return res.status(404).json({ message: "Webhook workflow not found" });

    await prisma.$transaction(async (tx: any) => {
        const run = await tx.zapRun.create({
            data: {
                zapId,
                metadata: body
            }
        });

        await tx.zapRunOutbox.create({
            data: {
                zapRunId: run.id
            }
        });
    });

    res.json({
        message: "Webhook received"
    });

});

const port = Number(process.env.PORT || 3001);
app.listen(port, () => {
    console.log(`hooks service running on port ${port}`);
});
