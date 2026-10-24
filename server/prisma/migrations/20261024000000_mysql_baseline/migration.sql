-- MySQL 8+ baseline for SCALive Quiz Arena.
CREATE TABLE `Quiz` (
    `id` VARCHAR(191) NOT NULL, `title` VARCHAR(255) NOT NULL, `description` TEXT NULL,
    `timerSeconds` INTEGER NOT NULL DEFAULT 15, `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL, PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Question` (
    `id` VARCHAR(191) NOT NULL, `quizId` VARCHAR(191) NOT NULL, `position` INTEGER NOT NULL,
    `text` TEXT NOT NULL, `optionA` TEXT NOT NULL, `optionB` TEXT NOT NULL, `optionC` TEXT NOT NULL,
    `optionD` TEXT NOT NULL, `correct` CHAR(1) NOT NULL, `explanation` TEXT NULL,
    INDEX `Question_quizId_position_idx`(`quizId`, `position`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `QuizSession` (
    `id` VARCHAR(191) NOT NULL, `code` VARCHAR(191) NOT NULL, `quizId` VARCHAR(191) NULL,
    `title` VARCHAR(255) NOT NULL,
    `status` ENUM('LOBBY','NEXT_QUESTION','QUESTION_ACTIVE','TIME_UP','ANSWER_REVEAL','LEADERBOARD','FINISHED') NOT NULL DEFAULT 'LOBBY',
    `stateVersion` INTEGER NOT NULL DEFAULT 0, `currentIndex` INTEGER NOT NULL DEFAULT -1,
    `revealedIndex` INTEGER NOT NULL DEFAULT -1, `timerSeconds` INTEGER NOT NULL,
    `lockJoinOnStart` BOOLEAN NOT NULL DEFAULT true, `questions` JSON NOT NULL,
    `questionStartedAt` DATETIME(3) NULL, `questionEndsAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `startedAt` DATETIME(3) NULL,
    `endedAt` DATETIME(3) NULL, UNIQUE INDEX `QuizSession_code_key`(`code`),
    INDEX `QuizSession_createdAt_idx`(`createdAt`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Participant` (
    `id` VARCHAR(191) NOT NULL, `sessionId` VARCHAR(191) NOT NULL, `name` VARCHAR(255) NOT NULL,
    `nameKey` VARCHAR(191) NOT NULL, `rollNo` VARCHAR(100) NULL, `tokenHash` VARCHAR(191) NOT NULL,
    `joinedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `Participant_tokenHash_key`(`tokenHash`), INDEX `Participant_sessionId_idx`(`sessionId`),
    UNIQUE INDEX `Participant_sessionId_nameKey_key`(`sessionId`, `nameKey`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `SeedRecord` (
    `key` VARCHAR(191) NOT NULL, `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Response` (
    `id` VARCHAR(191) NOT NULL, `sessionId` VARCHAR(191) NOT NULL, `participantId` VARCHAR(191) NOT NULL,
    `questionIndex` INTEGER NOT NULL, `questionId` VARCHAR(191) NOT NULL, `choice` CHAR(1) NOT NULL,
    `isCorrect` BOOLEAN NOT NULL, `responseTimeMs` INTEGER NOT NULL, `points` INTEGER NOT NULL,
    `receivedAt` DATETIME(3) NOT NULL, INDEX `Response_sessionId_questionIndex_idx`(`sessionId`, `questionIndex`),
    UNIQUE INDEX `Response_participantId_questionIndex_key`(`participantId`, `questionIndex`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Question` ADD CONSTRAINT `Question_quizId_fkey` FOREIGN KEY (`quizId`) REFERENCES `Quiz`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `QuizSession` ADD CONSTRAINT `QuizSession_quizId_fkey` FOREIGN KEY (`quizId`) REFERENCES `Quiz`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `Participant` ADD CONSTRAINT `Participant_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `QuizSession`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Response` ADD CONSTRAINT `Response_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `QuizSession`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Response` ADD CONSTRAINT `Response_participantId_fkey` FOREIGN KEY (`participantId`) REFERENCES `Participant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
