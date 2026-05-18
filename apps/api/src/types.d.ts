declare namespace Express {
  interface Request {
    user?: {
      id: string;
      role: "admin" | "support" | "operations" | "sales";
    };
  }
}
