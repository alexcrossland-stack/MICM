import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import companiesRouter from "./companies";
import usersRouter from "./users";
import invitationsRouter from "./invitations";
import assessmentsRouter from "./assessments";
import assessmentQuestionsRouter from "./assessmentQuestions";
import scoresRouter from "./scores";
import criterionNotesRouter from "./criterionNotes";
import actionsRouter from "./actions";
import domainsRouter from "./domains";
import reportsRouter from "./reports";
import targetsRouter from "./targets";
import programmeRouter from "./programme";
import demoRouter from "./demo";
import auditLogsRouter from "./auditLogs";

const router: IRouter = Router();

router.use(healthRouter);
router.use(demoRouter);
router.use(authRouter);
router.use(companiesRouter);
router.use(usersRouter);
router.use(invitationsRouter);
router.use(assessmentsRouter);
router.use(assessmentQuestionsRouter);
router.use(scoresRouter);
router.use(criterionNotesRouter);
router.use(actionsRouter);
router.use(domainsRouter);
router.use(reportsRouter);
router.use(targetsRouter);
router.use(programmeRouter);
router.use(auditLogsRouter);

export default router;
