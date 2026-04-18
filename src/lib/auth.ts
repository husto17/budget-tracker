import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { DEFAULT_CATEGORIES } from "./default-categories";

async function createUserWithDefaults(data: {
  email: string;
  name: string;
  password?: string;
  image?: string;
}) {
  // Two separate queries to avoid implicit transactions (not supported by PrismaNeonHttp)
  const user = await prisma.user.create({ data });
  await prisma.category.createMany({
    data: DEFAULT_CATEGORIES.map((cat) => ({
      ...cat,
      userId: user.id,
      isDefault: true,
    })),
  });
  return user;
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });

        if (!user || !user.password) return null;

        const isValid = await bcrypt.compare(credentials.password, user.password);
        if (!isValid) return null;

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === "google") {
        const email = user.email!;
        const existing = await prisma.user.findUnique({ where: { email } });

        if (!existing) {
          // First-time Google sign-in — create account with default categories
          await createUserWithDefaults({
            email,
            name: user.name ?? email.split("@")[0],
            image: user.image ?? undefined,
          });
        } else if (!existing.image && user.image) {
          // Update profile picture if missing
          await prisma.user.update({
            where: { email },
            data: { image: user.image },
          });
        }
      }
      return true;
    },
    async jwt({ token, user, account, trigger }) {
      if (user) {
        // Initial sign-in — look up DB user to get our cuid id
        const dbUser = await prisma.user.findUnique({
          where: { email: user.email! },
        });
        if (dbUser) token.id = dbUser.id;
      }
      if (account?.provider === "google" && !token.id) {
        const dbUser = await prisma.user.findUnique({
          where: { email: token.email! },
        });
        if (dbUser) token.id = dbUser.id;
      }
      void trigger;
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { id: string }).id = token.id as string;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
};
