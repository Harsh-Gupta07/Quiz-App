-- CreateTable
CREATE TABLE "SeedRecord" (
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeedRecord_pkey" PRIMARY KEY ("key")
);
