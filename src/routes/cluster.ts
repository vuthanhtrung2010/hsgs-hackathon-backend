
import { Router } from "express";
import { $Enums } from "../generated/prisma";

const router = Router();

const clusterNames: $Enums.Cluster[] = [
    $Enums.Cluster.MATH,
    $Enums.Cluster.VOCABULARY,
    $Enums.Cluster.READING,
    $Enums.Cluster.LISTENING
];

// GET /clusters
router.get('/', (req, res) => {
    res.json(clusterNames);
});

export default router;
