import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import companiesRouter from "./companies";
import usersRouter from "./users";
import invitationsRouter from "./invitations";
import assessmentsRouter from "./assessments";
import scoresRouter from "./scores";
import actionsRouter from "./actions";
import domainsRouter from "./domains";
import reportsRouter from "./reports";
import targetsRouter from "./targets";
import programmeRouter from "./programme";
import demoRouter from "./demo";

const router: IRouter = Router();

router.use(healthRouter);
router.use(demoRouter);
router.use(authRouter);
router.use(companiesRouter);
router.use(usersRouter);
router.use(invitationsRouter);
router.use(assessmentsRouter);
router.use(scoresRouter);
router.use(actionsRouter);
router.use(domainsRouter);
router.use(reportsRouter);
router.use(targetsRouter);
router.use(programmeRouter);

export default router;
