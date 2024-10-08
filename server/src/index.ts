import express, { Express, NextFunction, Request, Response } from "express";
import * as path from "path";
import bodyParser from "body-parser";

import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import { DateTime } from "luxon";
import {
  prisma,
  copyActivityToFolder,
  createActivity,
  createFolder,
  deleteActivity,
  deleteFolder,
  findOrCreateUser,
  getAllDoenetmlVersions,
  getActivityEditorData,
  getActivityViewerData,
  getAllRecentPublicActivities,
  getIsAdmin,
  getUserInfo,
  updateDoc,
  searchPublicContent,
  updateContent,
  assignActivity,
  listUserAssigned,
  getAssignmentDataFromCode,
  openAssignmentWithCode,
  closeAssignmentWithCode,
  updateUser,
  saveScoreAndState,
  getAssignmentScoreData,
  loadState,
  getAssignmentStudentData,
  getAllAssignmentScores,
  getStudentData,
  recordSubmittedEvent,
  getAnswersThatHaveSubmittedResponses,
  getDocumentSubmittedResponses,
  getAssignmentContent,
  getDocumentSubmittedResponseHistory,
  addPromotedContentGroup,
  addPromotedContent,
  updatePromotedContentGroup,
  loadPromotedContent,
  removePromotedContent,
  deletePromotedContentGroup,
  movePromotedContent,
  movePromotedContentGroup,
  InvalidRequestError,
  moveContent,
  getMyFolderContent,
  getAssignedScores,
  addClassification,
  removeClassification,
  getClassifications,
  searchPossibleClassifications,
  getPublicFolderContent,
  searchUsersWithPublicContent,
  getPublicEditorData,
  unassignActivity,
  updateAssignmentSettings,
  getAllLicenses,
  makeActivityPrivate,
  makeActivityPublic,
  LicenseCode,
  makeFolderPublic,
  makeFolderPrivate,
  searchMyFolderContent,
  upgradeAnonymousUser,
} from "./model";
import session from "express-session";
import { PrismaSessionStore } from "@quixo3/prisma-session-store";
import { Prisma } from "@prisma/client";

import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as MagicLinkStrategy } from "passport-magic-link";
//@ts-ignore
import { Strategy as AnonymIdStrategy } from "passport-anonym-uuid";

import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

import * as fs from "fs/promises";

const client = new SESClient({ region: "us-east-2" });

dotenv.config();

interface User {
  userId: Number;
  firstNames: string;
  lastNames: string;
  email: string;
}

declare module "express-serve-static-core" {
  interface Request {
    user: User;
  }
}

const app: Express = express();
app.use(cookieParser());

// make sure that when log out, it doesn't use old cached pages
app.use(function (req, res, next) {
  if (!req.user) {
    res.header("Cache-Control", "private, no-cache, no-store, must-revalidate");
    res.header("Expires", "-1");
    res.header("Pragma", "no-cache");
  }
  next();
});

const googleClientId = process.env.GOOGLE_CLIENT_ID || "";
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET || "";

passport.use(
  new GoogleStrategy(
    {
      clientID: googleClientId,
      clientSecret: googleClientSecret,
      callbackURL: (process.env.LOGIN_CALLBACK_ROOT || "") + "api/login/google",
      scope: ["profile", "email"],
    },
    (accessToken: any, refreshToken: any, profile: any, done: any) => {
      done(null, profile);
    },
  ),
);

passport.use(
  new MagicLinkStrategy(
    {
      secret: process.env.MAGIC_LINK_SECRET || "",
      allowReuse: true,
      userFields: ["email", "fromAnonymous"],
      tokenField: "token",
    },
    async (user, token) => {
      const confirmURL = `${process.env.CONFIRM_SIGNIN_URL}?token=${token}`;

      let email_html: string = "";

      try {
        const filePath = path.resolve(__dirname, "signin_email.html");

        email_html = await fs.readFile(filePath, { encoding: "utf8" });
      } catch (err) {
        console.log(err);
        throw Error("Could not send email");
      }

      email_html = email_html.replace(/CONFIRM_LINK/g, confirmURL);

      const params = {
        Source: "Doenet Accounts <info@doenet.org>",
        Destination: {
          ToAddresses: [user.email],
        },
        Message: {
          Subject: {
            Data: "Finish log into Doenet",
          },
          Body: {
            Text: {
              Data: `To finish your login into Doenet, go to the URL: ${confirmURL}`,
            },
            Html: {
              Data: email_html,
            },
          },
        },
      };

      // Send the email
      const sendEmail = async () => {
        try {
          const command = new SendEmailCommand(params);
          const response = await client.send(command);
          console.log("Email sent successfully", response);
        } catch (error) {
          console.error("Error sending email", error);
        }
      };

      sendEmail();
    },
    async (user: any) => {
      return {
        provider: "magiclink",
        email: user.email as string,
        fromAnonymous: Number(user.fromAnonymous) || 0,
      };
    },
  ),
);

passport.use(new AnonymIdStrategy());

passport.serializeUser<any, any>(async (req, user: any, done) => {
  if (user.provider === "magiclink") {
    const email: string = user.email;
    const fromAnonymous: number = user.fromAnonymous;

    let u;

    if (fromAnonymous > 0) {
      try {
        u = await upgradeAnonymousUser({ userId: fromAnonymous, email });
      } catch (e) {
        /// ignore any error
      }
    }

    if (!u) {
      u = await findOrCreateUser({
        email,
        firstNames: null,
        lastNames: "",
      });
    }

    return done(undefined, u.email);
  } else if (user.provider === "google") {
    var email = user.id + "@google.com";
    if (user.emails[0].verified) email = user.emails[0].value;

    const u = await findOrCreateUser({
      email,
      firstNames: user.name.givenName,
      lastNames: user.name.familyName,
    });
    return done(undefined, u.email);
  } else if (user.uuid) {
    const u = await findOrCreateUser({
      email: user.uuid + "@anonymous.doenet.org",
      lastNames: "",
      firstNames: null,
      isAnonymous: true,
    });
    return done(undefined, u.email);
  }
});

passport.deserializeUser(async (id: string, done) => {
  const u = await getUserInfo(id);
  done(null, u);
});

app.use(
  session({
    cookie: {
      maxAge: 365 * 24 * 60 * 60 * 1000, // ms
    },
    secret: process.env.SESSION_SECRET || "",
    resave: true,
    saveUninitialized: true,
    store: new PrismaSessionStore(prisma, {
      checkPeriod: 2 * 60 * 1000, //ms
      dbRecordIdIsSessionId: true,
      dbRecordIdFunction: undefined,
    }),
  }),
);

app.use(bodyParser.json({ limit: "50mb" }));
app.use(
  bodyParser.urlencoded({
    limit: "50mb",
    extended: true,
  }),
);

app.use(passport.initialize());
app.use(passport.session());

const port = process.env.PORT || 3000;

app.use(express.static(path.resolve(__dirname, "../public")));

app.get("/", (req: Request, res: Response) => {
  res.send("Express + TypeScript Server" + JSON.stringify(req?.user));
});

// An anonymous login that will be redirected to
// when going to getAssignmentDataFromCode without being logged in.
// Redirect back to that page after anonymous user is created and logged in.
app.get(
  "/api/login/anonymId/:code",
  passport.authenticate("anonymId"),
  (req: Request, res: Response) => {
    const code = req.params.code;
    res.redirect(`/api/getAssignmentDataFromCode/${code}`);
  },
);

app.get(
  "/api/auth/google",
  passport.authenticate("google", { scope: ["profile", "email"] }),
);

app.get(
  "/api/login/google",
  passport.authenticate("google", {
    successRedirect: "/",
    failureRedirect: "/login",
  }),
);

app.post(
  "/api/auth/magiclink",
  passport.authenticate("magiclink", { action: "requestToken" }),
  (req, res) => res.redirect("/"),
);

app.get(
  "/api/login/magiclink",
  passport.authenticate("magiclink", {
    action: "acceptToken",
    userPrimaryKey: "email",
  }),
  async (req: Request, res: Response) => {
    let user = await getUserInfo((req.user as any).email);
    res.send({ user });
  },
);

app.get("/api/logout", function (req, res, next) {
  req.logout(function (err) {
    if (err) {
      return next(err);
    }
    res.redirect("/");
  });
});

app.get("/api/getSignedIn", (req: Request, res: Response) => {
  const signedIn = req.user ? true : false;
  res.send({ signedIn });
});

app.get(
  "/api/getUser",
  async (req: Request, res: Response, next: NextFunction) => {
    const signedIn = req.user ? true : false;
    if (signedIn) {
      try {
        let user = await getUserInfo(req.user.email);
        res.send({ user });
      } catch (e) {
        next(e);
      }
    } else {
      res.send({});
    }
  },
);

app.post("/api/updateUser", async (req: Request, res: Response) => {
  const signedIn = req.user ? true : false;
  if (signedIn) {
    const loggedInUserId = Number(req.user.userId);
    const body = req.body;
    const firstNames = body.firstNames;
    const lastNames = body.lastNames;
    await updateUser({ userId: loggedInUserId, firstNames, lastNames });
    res.send({ firstNames, lastNames });
  } else {
    res.send({});
  }
});

app.get("/api/checkForCommunityAdmin", async (req: Request, res: Response) => {
  const loggedInUserId = Number(req.user?.userId ?? 0);
  const isAdmin = loggedInUserId ? await getIsAdmin(loggedInUserId) : false;
  res.send({ isAdmin });
});

app.get(
  "/api/getAllRecentPublicActivities",
  async (req: Request, res: Response) => {
    const docs = await getAllRecentPublicActivities();
    res.send(docs);
  },
);

app.get(
  "/api/getAssigned",
  async (req: Request, res: Response, next: NextFunction) => {
    const loggedInUserId = Number(req.user?.userId ?? 0);
    try {
      const assignedData = await listUserAssigned(loggedInUserId);
      res.send(assignedData);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        res.sendStatus(404);
      } else {
        next(e);
      }
    }
  },
);

app.get(
  "/api/getAssignedScores",
  async (req: Request, res: Response, next: NextFunction) => {
    const loggedInUserId = Number(req.user?.userId ?? 0);
    try {
      const scoreData = await getAssignedScores(loggedInUserId);
      res.send({ ...scoreData, folder: null });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        res.sendStatus(404);
      } else {
        next(e);
      }
    }
  },
);

app.post(
  "/api/deleteActivity",
  async (req: Request, res: Response, next: NextFunction) => {
    const loggedInUserId = Number(req.user?.userId ?? 0);
    const body = req.body;
    const id = Number(body.activityId);
    try {
      await deleteActivity(id, loggedInUserId);
      res.send({});
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        res.sendStatus(403);
      } else {
        next(e);
      }
    }
  },
);

app.post(
  "/api/deleteFolder",
  async (req: Request, res: Response, next: NextFunction) => {
    const loggedInUserId = Number(req.user?.userId ?? 0);
    const body = req.body;
    const folderId = Number(body.folderId);
    try {
      await deleteFolder(folderId, loggedInUserId);
      res.send({});
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        res.sendStatus(403);
      } else {
        next(e);
      }
    }
  },
);

app.post(
  "/api/createActivity/",
  async (req: Request, res: Response, next: NextFunction) => {
    const loggedInUserId = Number(req.user?.userId ?? 0);
    try {
      const { activityId, docId } = await createActivity(loggedInUserId, null);
      res.send({ activityId, docId });
    } catch (e) {
      next(e);
    }
  },
);

app.post(
  "/api/createActivity/:parentFolderId",
  async (req: Request, res: Response, next: NextFunction) => {
    const loggedInUserId = Number(req.user?.userId ?? 0);
    const parentFolderId = Number(req.params.parentFolderId);
    try {
      const { activityId, docId } = await createActivity(
        loggedInUserId,
        parentFolderId,
      );
      res.send({ activityId, docId });
    } catch (e) {
      next(e);
    }
  },
);

app.post(
  "/api/createFolder/",
  async (req: Request, res: Response, next: NextFunction) => {
    const loggedInUserId = Number(req.user?.userId ?? 0);
    try {
      const { folderId } = await createFolder(loggedInUserId, null);
      res.send({ folderId });
    } catch (e) {
      next(e);
    }
  },
);

app.post(
  "/api/createFolder/:parentFolderId",
  async (req: Request, res: Response, next: NextFunction) => {
    const loggedInUserId = Number(req.user?.userId ?? 0);
    const parentFolderId = Number(req.params.parentFolderId);
    try {
      const { folderId } = await createFolder(loggedInUserId, parentFolderId);
      res.send({ folderId });
    } catch (e) {
      next(e);
    }
  },
);

app.post(
  "/api/updateContentName",
  async (req: Request, res: Response, next: NextFunction) => {
    const loggedInUserId = Number(req.user?.userId ?? 0);
    const body = req.body;
    const id = Number(body.id);
    const name = body.name;
    try {
      await updateContent({ id, name, ownerId: loggedInUserId });
      res.send({});
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2025"
      ) {
        res.sendStatus(403);
      } else {
        next(e);
      }
    }
  },
);

app.post(
  "/api/makeActivityPublic",
  async (req: Request, res: Response, next: NextFunction) => {
    const loggedInUserId = Number(req.user?.userId ?? 0);
    const body = req.body;
    const id = Number(body.id);

    let licenseCode: LicenseCode;

    let requestedCode: string = body.licenseCode;
    switch (requestedCode) {
      case "CCDUAL":
      case "CCBYSA":
      case "CCBYNCSA": {
        licenseCode = requestedCode;
        break;
      }
      default: {
        return res.status(400).send("Invalid license code");
      }
    }

    try {
      let data = await makeActivityPublic({
        id,
        ownerId: loggedInUserId,
        licenseCode,
      });
      res.send(data);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        res.sendStatus(403);
      } else {
        next(e);
      }
    }
  },
);

app.post(
  "/api/makeActivityPrivate",
  async (req: Request, res: Response, next: NextFunction) => {
    const loggedInUserId = Number(req.user?.userId ?? 0);
    const body = req.body;
    const id = Number(body.id);
    try {
      let data = await makeActivityPrivate({ id, ownerId: loggedInUserId });
      res.send(data);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        res.sendStatus(403);
      } else {
        next(e);
      }
    }
  },
);

app.post(
  "/api/makeFolderPublic",
  async (req: Request, res: Response, next: NextFunction) => {
    const loggedInUserId = Number(req.user?.userId ?? 0);
    const body = req.body;
    const id = Number(body.id);

    let licenseCode: LicenseCode;

    let requestedCode: string = body.licenseCode;
    switch (requestedCode) {
      case "CCDUAL":
      case "CCBYSA":
      case "CCBYNCSA": {
        licenseCode = requestedCode;
        break;
      }
      default: {
        return res.status(400).send("Invalid license code");
      }
    }

    try {
      let data = await makeFolderPublic({
        id,
        ownerId: loggedInUserId,
        licenseCode,
      });
      res.send(data);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        res.sendStatus(403);
      } else {
        next(e);
      }
    }
  },
);

app.post(
  "/api/makeFolderPrivate",
  async (req: Request, res: Response, next: NextFunction) => {
    const loggedInUserId = Number(req.user?.userId ?? 0);
    const body = req.body;
    const id = Number(body.id);
    try {
      let data = await makeFolderPrivate({ id, ownerId: loggedInUserId });
      res.send(data);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        res.sendStatus(403);
      } else {
        next(e);
      }
    }
  },
);

app.get(
  "/api/loadSupportingFileInfo/:activityId",
  (req: Request, res: Response) => {
    const activityId = Number(req.params.activityId as string);
    res.send({
      success: true,
      supportingFiles: [],
      canUpload: true,
      userQuotaBytesAvailable: 1000000,
      quotaBytes: 9000000,
    });
  },
);

app.get(
  "/api/getCoursePermissionsAndSettings",
  (req: Request, res: Response) => {
    res.send({});
  },
);

app.get("/api/searchPublicContent", async (req: Request, res: Response) => {
  const query = req.query.q as string;
  res.send({
    users: await searchUsersWithPublicContent(query),
    content: await searchPublicContent(query),
  });
});

app.post(
  "/api/addPromotedContent",
  async (req: Request, res: Response, next: NextFunction) => {
    const { groupId, activityId } = req.body;
    const loggedInUserId = Number(req.user?.userId ?? 0);
    try {
      await addPromotedContent(groupId, activityId, loggedInUserId);
      res.send({});
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        // The .code property can be accessed in a type-safe manner
        if (e.code === "P2002") {
          res.status(400).send("This activity is already in that group.");
          return;
        } else if (e.code === "P2003") {
          res.status(400).send("That group does not exist.");
          return;
        }
      } else if (e instanceof InvalidRequestError) {
        res.status(e.errorCode).send(e.message);
        return;
      }
      next(e);
    }
  },
);

app.get(
  "/api/loadPromotedContent",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const loggedInUserId = Number(req.user?.userId ?? 0);
      const content = await loadPromotedContent(loggedInUserId);
      res.send(content);
    } catch (e) {
      if (e instanceof InvalidRequestError) {
        res.status(e.errorCode).send(e.message);
        return;
      }
      next(e);
    }
  },
);

app.post(
  "/api/removePromotedContent",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const groupId = Number(req.body.groupId);
      const activityId = Number(req.body.activityId);
      const loggedInUserId = Number(req.user?.userId ?? 0);

      await removePromotedContent(groupId, activityId, loggedInUserId);
      res.send({});
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === "P2025") {
          res.status(400).send("That group does not exist.");
          return;
        }
      } else if (e instanceof InvalidRequestError) {
        res.status(e.errorCode).send(e.message);
        return;
      }
      next(e);
    }
  },
);

app.post(
  "/api/movePromotedContent",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const groupId = Number(req.body.groupId);
      const activityId = Number(req.body.activityId);
      const desiredPosition = Number(req.body.desiredPosition);
      const loggedInUserId = Number(req.user?.userId ?? 0);

      await movePromotedContent(
        groupId,
        activityId,
        loggedInUserId,
        desiredPosition,
      );
      res.send({});
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === "P2025") {
          res.status(400).send("That group does not exist.");
          return;
        }
      } else if (e instanceof InvalidRequestError) {
        res.status(e.errorCode).send(e.message);
        return;
      }
      next(e);
    }
  },
);

app.post(
  "/api/addPromotedContentGroup",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { groupName } = req.body;
      const loggedInUserId = Number(req.user?.userId ?? 0);
      const id = await addPromotedContentGroup(groupName, loggedInUserId);
      res.send({ id });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        // The .code property can be accessed in a type-safe manner
        if (e.code === "P2002") {
          res.status(400).send("A group with that name already exists.");
          return;
        }
      } else if (e instanceof InvalidRequestError) {
        res.status(e.errorCode).send(e.message);
        return;
      }
      next(e);
    }
  },
);

app.post(
  "/api/updatePromotedContentGroup",
  async (req: Request, res: Response, next: NextFunction) => {
    const { groupId, newGroupName, homepage, currentlyFeatured } = req.body;
    const loggedInUserId = Number(req.user?.userId ?? 0);
    try {
      await updatePromotedContentGroup(
        Number(groupId),
        newGroupName,
        homepage,
        currentlyFeatured,
        loggedInUserId,
      );
      res.send({});
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        // The .code property can be accessed in a type-safe manner
        if (e.code === "P2002") {
          res.status(400).send("A group with that name already exists.");
          return;
        }
      } else if (e instanceof InvalidRequestError) {
        res.status(e.errorCode).send(e.message);
        return;
      }
      next(e);
    }
  },
);

app.post(
  "/api/deletePromotedContentGroup",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { groupId } = req.body;
      const loggedInUserId = Number(req.user?.userId ?? 0);
      await deletePromotedContentGroup(Number(groupId), loggedInUserId);
      res.send({});
    } catch (e) {
      if (e instanceof InvalidRequestError) {
        res.status(e.errorCode).send(e.message);
        return;
      }
      next(e);
    }
  },
);

app.post(
  "/api/movePromotedContentGroup",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { groupId, desiredPosition } = req.body;
      const loggedInUserId = Number(req.user?.userId ?? 0);
      await movePromotedContentGroup(
        Number(groupId),
        loggedInUserId,
        Number(desiredPosition),
      );
      res.send({});
    } catch (e) {
      if (e instanceof InvalidRequestError) {
        res.status(e.errorCode).send(e.message);
        return;
      }
      next(e);
    }
  },
);

app.get(
  "/api/getActivityEditorData/:activityId",
  async (req: Request, res: Response, next: NextFunction) => {
    const activityId = Number(req.params.activityId);
    const loggedInUserId = Number(req.user?.userId ?? 0);
    try {
      const editorData = await getActivityEditorData(
        activityId,
        loggedInUserId,
      );
      res.send(editorData);
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2025"
      ) {
        res.sendStatus(404);
      } else {
        next(e);
      }
    }
  },
);

app.get(
  "/api/getPublicEditorData/:activityId",
  async (req: Request, res: Response, next: NextFunction) => {
    const activityId = Number(req.params.activityId);
    try {
      const editorData = await getPublicEditorData(activityId);
      res.send(editorData);
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2001"
      ) {
        res.sendStatus(404);
      } else {
        next(e);
      }
    }
  },
);

app.get("/api/getAllDoenetmlVersions", async (req: Request, res: Response) => {
  const allDoenetmlVersions = await getAllDoenetmlVersions();
  res.send(allDoenetmlVersions);
});

app.get("/api/getAllLicenses", async (req: Request, res: Response) => {
  const allLicenses = await getAllLicenses();
  res.send(allLicenses);
});

app.get(
  "/api/getActivityView/:activityId",
  async (req: Request, res: Response, next: NextFunction) => {
    const loggedInUserId = Number(req.user?.userId ?? 0);
    const activityId = Number(req.params.activityId);

    try {
      const viewerData = await getActivityViewerData(
        activityId,
        loggedInUserId,
      );
      res.send(viewerData);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        res.sendStatus(404);
      } else {
        next(e);
      }
    }
  },
);

app.get(
  "/api/getAssignmentDataFromCode/:code",
  async (req: Request, res: Response, next: NextFunction) => {
    const code = req.params.code;

    if (!req.user) {
      // If not logged in, then redirect to log in anonymously,
      // which will redirect back here with the anonymous user
      // logged in.
      return res.redirect(`/api/login/anonymId/${code}`);
    }

    let assignmentData = await getAssignmentDataFromCode(code);

    let firstNames: string | null = req.user.firstNames;
    let lastNames: string = req.user.lastNames;

    res.send({ student: { firstNames, lastNames }, ...assignmentData });
  },
);

app.post(
  "/api/saveDoenetML",
  async (req: Request, res: Response, next: NextFunction) => {
    const loggedInUserId = Number(req.user?.userId ?? 0);
    const body = req.body;
    const doenetML = body.doenetML;
    const docId = Number(body.docId);
    try {
      await updateDoc({
        id: docId,
        source: doenetML,
        ownerId: loggedInUserId,
      });
      res.send({});
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        res.sendStatus(403);
      } else {
        next(e);
      }
    }
  },
);

app.post(
  "/api/updateContentSettings",
  async (req: Request, res: Response, next: NextFunction) => {
    const loggedInUserId = Number(req.user?.userId ?? 0);
    const body = req.body;
    const id = Number(body.id);
    const imagePath = body.imagePath;
    const name = body.name;
    // TODO - deal with learning outcomes
    const learningOutcomes = body.learningOutcomes;
    try {
      await updateContent({
        id,
        imagePath,
        name,
        ownerId: loggedInUserId,
      });
      res.send({});
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        res.sendStatus(403);
      } else {
        next(e);
      }
    }
  },
);

app.post(
  "/api/updateDocumentSettings",
  async (req: Request, res: Response, next: NextFunction) => {
    const loggedInUserId = Number(req.user?.userId ?? 0);
    const body = req.body;
    const docId = Number(body.docId);
    const name = body.name;
    // TODO - deal with learning outcomes
    const learningOutcomes = body.learningOutcomes;
    const doenetmlVersionId = Number(body.doenetmlVersionId);
    try {
      await updateDoc({
        id: docId,
        name,
        doenetmlVersionId,
        ownerId: loggedInUserId,
      });
      res.send({});
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        res.sendStatus(403);
      } else {
        next(e);
      }
    }
  },
);

app.post("/api/moveContent", async (req: Request, res: Response) => {
  const id = Number(req.body.id);
  const desiredParentFolderId = req.body.desiredParentFolderId
    ? Number(req.body.desiredParentFolderId)
    : null;
  const desiredPosition = Number(req.body.desiredPosition);
  const loggedInUserId = Number(req.user?.userId ?? 0);

  await moveContent({
    id,
    desiredParentFolderId,
    desiredPosition,
    ownerId: loggedInUserId,
  });

  res.send({});
});

app.post("/api/duplicateActivity", async (req: Request, res: Response) => {
  const targetActivityId = Number(req.body.activityId);
  const desiredParentFolderId = req.body.desiredParentFolderId
    ? Number(req.body.desiredParentFolderId)
    : null;
  const loggedInUserId = Number(req.user?.userId ?? 0);

  let newActivityId = await copyActivityToFolder(
    targetActivityId,
    loggedInUserId,
    desiredParentFolderId,
  );

  res.send({ newActivityId, userId: loggedInUserId });
});

app.post("/api/assignActivity", async (req: Request, res: Response) => {
  const activityId = Number(req.body.id);
  const loggedInUserId = Number(req.user?.userId ?? 0);

  await assignActivity(activityId, loggedInUserId);

  res.send({ userId: loggedInUserId });
});

app.post(
  "/api/openAssignmentWithCode",
  async (req: Request, res: Response, next: NextFunction) => {
    const loggedInUserId = Number(req.user?.userId ?? 0);
    const body = req.body;
    const activityId = Number(body.activityId);
    const closeAt = DateTime.fromISO(body.closeAt);

    try {
      const { classCode, codeValidUntil } = await openAssignmentWithCode(
        activityId,
        closeAt,
        loggedInUserId,
      );
      res.send({ classCode, codeValidUntil });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        res.sendStatus(403);
      } else {
        next(e);
      }
    }
  },
);

app.post(
  "/api/updateAssignmentSettings",
  async (req: Request, res: Response, next: NextFunction) => {
    const loggedInUserId = Number(req.user?.userId ?? 0);
    const body = req.body;
    const activityId = Number(body.activityId);
    const closeAt = DateTime.fromISO(body.closeAt);

    try {
      await updateAssignmentSettings(activityId, closeAt, loggedInUserId);
      res.send({});
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        res.sendStatus(403);
      } else {
        next(e);
      }
    }
  },
);

app.post(
  "/api/closeAssignmentWithCode",
  async (req: Request, res: Response, next: NextFunction) => {
    const loggedInUserId = Number(req.user?.userId ?? 0);
    const body = req.body;
    const activityId = Number(body.activityId);

    try {
      await closeAssignmentWithCode(activityId, loggedInUserId);
      res.send({});
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        res.sendStatus(403);
      } else {
        next(e);
      }
    }
  },
);

app.post(
  "/api/unassignActivity",
  async (req: Request, res: Response, next: NextFunction) => {
    const loggedInUserId = Number(req.user?.userId ?? 0);
    const body = req.body;
    const activityId = Number(body.activityId);

    try {
      await unassignActivity(activityId, loggedInUserId);
      res.send({});
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        res.sendStatus(403);
      } else {
        next(e);
      }
    }
  },
);

app.post(
  "/api/saveScoreAndState",
  async (req: Request, res: Response, next: NextFunction) => {
    const body = req.body;
    const activityId = Number(body.activityId);
    const docId = Number(body.docId);
    const docVersionNum = Number(body.docVersionNum);
    const loggedInUserId = Number(req.user?.userId ?? 0);
    const score = Number(body.score);
    const onSubmission = body.onSubmission as boolean;
    const state = body.state;

    try {
      await saveScoreAndState({
        activityId,
        docId,
        docVersionNum,
        userId: loggedInUserId,
        score,
        onSubmission,
        state,
      });
      res.send({});
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientValidationError ||
        e instanceof Prisma.PrismaClientKnownRequestError
      ) {
        res.status(400).send({});
      } else {
        next(e);
      }
    }
  },
);

app.get(
  "/api/loadState",
  async (req: Request, res: Response, next: NextFunction) => {
    const activityId = Number(req.query.activityId);
    const docId = Number(req.query.docId);
    const docVersionNum = Number(req.query.docVersionNum);
    const requestedUserId = Number((req.query.userId || req.user?.userId) ?? 0);
    const loggedInUserId = Number(req.user?.userId ?? 0);
    const withMaxScore = req.query.withMaxScore === "1";

    try {
      const state = await loadState({
        activityId,
        docId,
        docVersionNum,
        requestedUserId,
        userId: loggedInUserId,
        withMaxScore,
      });
      res.send({ state });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        res.status(204).send({});
      } else {
        next(e);
      }
    }
  },
);

app.get(
  "/api/getAssignmentData/:activityId",
  async (req: Request, res: Response, next: NextFunction) => {
    const activityId = Number(req.params.activityId);
    const loggedInUserId = Number(req.user?.userId ?? 0);

    try {
      const assignmentData = await getAssignmentScoreData({
        activityId,
        ownerId: loggedInUserId,
      });
      const answerList = await getAnswersThatHaveSubmittedResponses({
        activityId,
        ownerId: loggedInUserId,
      });
      const assignmentContent = await getAssignmentContent({
        activityId,
        ownerId: loggedInUserId,
      });
      res.send({ assignmentData, answerList, assignmentContent });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        res.sendStatus(404);
      } else {
        next(e);
      }
    }
  },
);

app.get(
  "/api/getAssignmentStudentData/:activityId/",
  async (req: Request, res: Response, next: NextFunction) => {
    const activityId = Number(req.params.activityId);
    const loggedInUserId = Number(req.user?.userId ?? 0);

    try {
      const assignmentData = await getAssignmentStudentData({
        activityId,
        loggedInUserId,
        studentId: loggedInUserId,
      });
      res.send(assignmentData);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        res.sendStatus(404);
      } else {
        next(e);
      }
    }
  },
);

app.get(
  "/api/getAssignmentStudentData/:activityId/:userId",
  async (req: Request, res: Response, next: NextFunction) => {
    const activityId = Number(req.params.activityId);
    const userId = Number(req.params.userId);
    const loggedInUserId = Number(req.user?.userId ?? 0);

    try {
      const assignmentData = await getAssignmentStudentData({
        activityId,
        loggedInUserId,
        studentId: userId,
      });
      res.send(assignmentData);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        res.sendStatus(404);
      } else {
        next(e);
      }
    }
  },
);

app.get(
  "/api/getAllAssignmentScores/",
  async (req: Request, res: Response, next: NextFunction) => {
    const loggedInUserId = Number(req.user?.userId ?? 0);

    try {
      const data = await getAllAssignmentScores({
        ownerId: loggedInUserId,
        parentFolderId: null,
      });
      res.send(data);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        res.sendStatus(404);
      } else {
        next(e);
      }
    }
  },
);

app.get(
  "/api/getAllAssignmentScores/:parentFolderId",
  async (req: Request, res: Response, next: NextFunction) => {
    const folderId = Number(req.params.parentFolderId);
    const loggedInUserId = Number(req.user?.userId ?? 0);

    try {
      const data = await getAllAssignmentScores({
        ownerId: loggedInUserId,
        parentFolderId: folderId,
      });
      res.send(data);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        res.sendStatus(404);
      } else {
        next(e);
      }
    }
  },
);

app.get(
  "/api/getStudentData/:userId/",
  async (req: Request, res: Response, next: NextFunction) => {
    const userId = Number(req.params.userId);
    const loggedInUserId = Number(req.user?.userId ?? 0);

    try {
      const data = await getStudentData({
        userId: userId,
        ownerId: loggedInUserId,
        parentFolderId: null,
      });
      res.send(data);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        res.sendStatus(404);
      } else {
        next(e);
      }
    }
  },
);

app.get(
  "/api/getStudentData/:userId/:parentFolderId",
  async (req: Request, res: Response, next: NextFunction) => {
    const userId = Number(req.params.userId);
    const loggedInUserId = Number(req.user?.userId ?? 0);
    const parentFolderId = Number(req.params.parentFolderId);

    try {
      const data = await getStudentData({
        userId: userId,
        ownerId: loggedInUserId,
        parentFolderId,
      });
      res.send(data);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        res.sendStatus(404);
      } else {
        next(e);
      }
    }
  },
);

app.post(
  "/api/recordSubmittedEvent",
  async (req: Request, res: Response, next: NextFunction) => {
    const body = req.body;
    const activityId = Number(body.activityId);
    const docId = Number(body.docId);
    const docVersionNum = Number(body.docVersionNum);
    const answerId = body.answerId as string;
    const loggedInUserId = Number(req.user?.userId ?? 0);
    const response = body.result.response as string;
    const itemNumber = Number(body.result.itemNumber);
    const creditAchieved = Number(body.result.creditAchieved);
    const itemCreditAchieved = Number(body.result.itemCreditAchieved);
    const documentCreditAchieved = Number(body.result.documentCreditAchieved);
    const answerNumber = body.answerNumber
      ? Number(body.answerNumber)
      : undefined;

    try {
      await recordSubmittedEvent({
        activityId,
        docId,
        docVersionNum,
        userId: loggedInUserId,
        answerId,
        answerNumber,
        response,
        itemNumber,
        creditAchieved,
        itemCreditAchieved,
        documentCreditAchieved,
      });
      res.send({});
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientValidationError ||
        e instanceof Prisma.PrismaClientKnownRequestError
      ) {
        res.status(400).send({});
      } else {
        next(e);
      }
    }
  },
);

app.get(
  "/api/getSubmittedResponses/:activityId/:docId/:docVersionNum",
  async (req: Request, res: Response, next: NextFunction) => {
    const activityId = Number(req.params.activityId);
    const docId = Number(req.params.docId);
    const docVersionNum = Number(req.params.docVersionNum);
    const answerId = req.query.answerId as string;
    const loggedInUserId = Number(req.user?.userId ?? 0);

    try {
      const responseData = await getDocumentSubmittedResponses({
        activityId,
        docId,
        docVersionNum,
        answerId,
        ownerId: loggedInUserId,
      });
      res.send(responseData);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        res.sendStatus(204);
      } else {
        next(e);
      }
    }
  },
);

app.get(
  "/api/getSubmittedResponseHistory/:activityId/:docId/:docVersionNum/:userId",
  async (req: Request, res: Response, next: NextFunction) => {
    const activityId = Number(req.params.activityId);
    const docId = Number(req.params.docId);
    const docVersionNum = Number(req.params.docVersionNum);
    const userId = Number(req.params.userId);
    const answerId = req.query.answerId as string;
    const loggedInUserId = Number(req.user?.userId ?? 0);

    try {
      const responseData = await getDocumentSubmittedResponseHistory({
        activityId,
        docId,
        docVersionNum,
        answerId,
        userId,
        ownerId: loggedInUserId,
      });
      res.send(responseData);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        res.sendStatus(204);
      } else {
        next(e);
      }
    }
  },
);

app.get(
  "/api/getMyFolderContent/:ownerId/",
  async (req: Request, res: Response, next: NextFunction) => {
    const ownerId = Number(req.params.ownerId);
    const loggedInUserId = Number(req.user?.userId ?? 0);

    if (ownerId !== loggedInUserId) {
      return res.send({ notMe: true });
    }

    try {
      const contentData = await getMyFolderContent({
        folderId: null,
        loggedInUserId,
      });

      const allDoenetmlVersions = await getAllDoenetmlVersions();
      const allLicenses = await getAllLicenses();
      res.send({ allDoenetmlVersions, allLicenses, ...contentData });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        res.sendStatus(404);
      } else {
        next(e);
      }
    }
  },
);

app.get(
  "/api/getMyFolderContent/:ownerId/:folderId",
  async (req: Request, res: Response, next: NextFunction) => {
    const ownerId = Number(req.params.ownerId);
    const folderId = Number(req.params.folderId);
    const loggedInUserId = Number(req.user?.userId ?? 0);

    if (ownerId !== loggedInUserId) {
      return res.send({ notMe: true });
    }

    try {
      const contentData = await getMyFolderContent({
        folderId,
        loggedInUserId,
      });
      const allDoenetmlVersions = await getAllDoenetmlVersions();
      const allLicenses = await getAllLicenses();
      res.send({ allDoenetmlVersions, allLicenses, ...contentData });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        res.sendStatus(404);
      } else {
        next(e);
      }
    }
  },
);

app.get(
  "/api/searchMyFolderContent/:ownerId",
  async (req: Request, res: Response, next: NextFunction) => {
    const ownerId = Number(req.params.ownerId);
    const loggedInUserId = Number(req.user?.userId ?? 0);
    const query = req.query.q as string;

    if (ownerId !== loggedInUserId) {
      return res.send({ notMe: true });
    }

    try {
      const contentData = await searchMyFolderContent({
        folderId: null,
        loggedInUserId,
        query,
      });

      const allDoenetmlVersions = await getAllDoenetmlVersions();
      const allLicenses = await getAllLicenses();
      res.send({ allDoenetmlVersions, allLicenses, ...contentData });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        res.sendStatus(404);
      } else {
        next(e);
      }
    }
  },
);

app.get(
  "/api/searchMyFolderContent/:ownerId/:folderId",
  async (req: Request, res: Response, next: NextFunction) => {
    const ownerId = Number(req.params.ownerId);
    const folderId = Number(req.params.folderId);
    const loggedInUserId = Number(req.user?.userId ?? 0);
    const query = req.query.q as string;

    if (ownerId !== loggedInUserId) {
      return res.send({ notMe: true });
    }

    try {
      const contentData = await searchMyFolderContent({
        folderId,
        loggedInUserId,
        query,
      });
      const allDoenetmlVersions = await getAllDoenetmlVersions();
      const allLicenses = await getAllLicenses();
      res.send({ allDoenetmlVersions, allLicenses, ...contentData });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        res.sendStatus(404);
      } else {
        next(e);
      }
    }
  },
);

app.get(
  "/api/getPublicFolderContent/:ownerId",
  async (req: Request, res: Response, next: NextFunction) => {
    const ownerId = Number(req.params.ownerId);
    try {
      // send 0 as the logged in content to make sure get only public content
      const contentData = await getPublicFolderContent({
        ownerId,
        folderId: null,
      });
      res.send(contentData);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        res.status(404).send("No content found");
      } else {
        next(e);
      }
    }
  },
);

app.get(
  "/api/getPublicFolderContent/:ownerId/:folderId",
  async (req: Request, res: Response, next: NextFunction) => {
    const ownerId = Number(req.params.ownerId);
    const folderId = Number(req.params.folderId);
    try {
      // send 0 as the logged in content to make sure get only public content
      const contentData = await getPublicFolderContent({
        ownerId,
        folderId,
      });
      res.send(contentData);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        res.status(404).send("No content found");
      } else {
        next(e);
      }
    }
  },
);

app.post(
  "/api/addClassification",
  async (req: Request, res: Response, next: NextFunction) => {
    const { classificationId, activityId } = req.body;
    const loggedInUserId = Number(req.user?.userId ?? 0);
    try {
      await addClassification(activityId, classificationId, loggedInUserId);
      res.send({});
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        // The .code property can be accessed in a type-safe manner
        if (e.code === "P2002") {
          res
            .status(400)
            .send("This activity already has that classification.");
          return;
        } else if (e.code === "P2003") {
          res.status(400).send("That classification does not exist.");
          return;
        }
      } else if (e instanceof InvalidRequestError) {
        res.status(e.errorCode).send(e.message);
        return;
      }
      next(e);
    }
  },
);

app.post(
  "/api/removeClassification",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const classificationId = Number(req.body.classificationId);
      const activityId = Number(req.body.activityId);
      const loggedInUserId = Number(req.user?.userId ?? 0);

      await removeClassification(activityId, classificationId, loggedInUserId);
      res.send({});
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === "P2025") {
          res.status(400).send("That classification does not exist.");
          return;
        }
      } else if (e instanceof InvalidRequestError) {
        res.status(e.errorCode).send(e.message);
        return;
      }
      next(e);
    }
  },
);

app.get(
  "/api/getClassifications",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { activityId } = req.body;
      const loggedInUserId = Number(req.user?.userId ?? 0);
      const classifications = await getClassifications(
        activityId,
        loggedInUserId,
      );
      res.send(classifications);
    } catch (e) {
      if (e instanceof InvalidRequestError) {
        res.status(e.errorCode).send(e.message);
        return;
      }
      next(e);
    }
  },
);
app.get(
  "/api/searchPossibleClassifications",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = req.query.q as string;
      const searchResults = await searchPossibleClassifications(query);
      res.send(searchResults);
    } catch (e) {
      if (e instanceof InvalidRequestError) {
        res.status(e.errorCode).send(e.message);
        return;
      }
      next(e);
    }
  },
);

// handle every other route with index.html, which will contain
// a script tag to your application's JavaScript file(s).
app.get("*", function (request, response) {
  response.sendFile(path.resolve(__dirname, "../public/index.html"));
});

app.listen(port, () => {
  console.log(`[server]: Server is running at http://localhost:${port}`);
});
