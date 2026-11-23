-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "pin" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "barberId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "User_barberId_fkey" FOREIGN KEY ("barberId") REFERENCES "Barber" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Barber" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "tierId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "commissionTierId" TEXT,
    "commissionOverrideEnabled" BOOLEAN NOT NULL DEFAULT false,
    "commissionOverrideThresholdHeads" INTEGER,
    "commissionOverrideRatePct" INTEGER,
    CONSTRAINT "Barber_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "KapsterTier" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Barber_commissionTierId_fkey" FOREIGN KEY ("commissionTierId") REFERENCES "KapsterTier" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "KapsterTier" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "CommissionRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "scopeType" TEXT NOT NULL,
    "tierId" TEXT,
    "barberId" TEXT,
    "productCategoryId" TEXT,
    "thresholdHeads" INTEGER NOT NULL,
    "ratePct" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ProductCategory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "isBarberService" BOOLEAN NOT NULL DEFAULT false,
    "commissionRatePct" INTEGER NOT NULL DEFAULT 0,
    "commissionEnabled" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "ServiceItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "durationMin" INTEGER NOT NULL DEFAULT 60,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "costPrice" INTEGER,
    "stock" INTEGER NOT NULL,
    "minStock" INTEGER NOT NULL DEFAULT 5,
    "active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ProductCategory" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "invoiceNo" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "total" INTEGER NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "tipAmount" INTEGER NOT NULL DEFAULT 0,
    "tipBarberId" TEXT,
    "tipMethod" TEXT,
    "tipStatus" TEXT NOT NULL DEFAULT 'NONE',
    "tipClaimedAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'NORMAL',
    "voidReason" TEXT,
    "voidedById" TEXT,
    "voidedAt" DATETIME,
    "createdById" TEXT NOT NULL,
    "customerName" TEXT
);

-- CreateTable
CREATE TABLE "TransactionItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "transactionId" TEXT NOT NULL,
    "itemType" TEXT NOT NULL,
    "serviceItemId" TEXT,
    "productId" TEXT,
    "name" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "barberId" TEXT,
    "kepalaGroup" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "TransactionItem_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Attendance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "barberId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "clockInAt" DATETIME NOT NULL,
    "lateMinutes" INTEGER NOT NULL,
    "deductedHours" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Attendance_barberId_fkey" FOREIGN KEY ("barberId") REFERENCES "Barber" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerName" TEXT NOT NULL,
    "whatsapp" TEXT,
    "date" TEXT NOT NULL,
    "time" TEXT NOT NULL,
    "serviceItemId" TEXT NOT NULL,
    "barberId" TEXT NOT NULL,
    "durationMin" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'WAITING',
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ExpenseCategory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "ownerOnly" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Expense_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CashDay" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" TEXT NOT NULL,
    "openingCash" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "closedById" TEXT,
    "closedAt" DATETIME,
    "countedCash" INTEGER,
    "expectedCash" INTEGER,
    "difference" INTEGER,
    "differenceNote" TEXT,
    "reopenedById" TEXT,
    "reopenedAt" DATETIME,
    "reopenReason" TEXT
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "detail" TEXT
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "StockAdjustment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StockAdjustment_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PayrollPeriod" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedById" TEXT,
    "closedAt" DATETIME,
    "reopenedById" TEXT,
    "reopenedAt" DATETIME
);

-- CreateTable
CREATE TABLE "PayrollLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "periodId" TEXT NOT NULL,
    "barberId" TEXT NOT NULL,
    "daysWorked" INTEGER NOT NULL,
    "lateCount" INTEGER NOT NULL,
    "attendancePay" INTEGER NOT NULL,
    "komisi" INTEGER NOT NULL,
    "tip" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "attendanceDetail" JSONB,
    "status" TEXT NOT NULL DEFAULT 'UNPAID',
    "paidAt" DATETIME,
    "paidById" TEXT,
    CONSTRAINT "PayrollLine_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "PayrollPeriod" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PayrollLine_barberId_fkey" FOREIGN KEY ("barberId") REFERENCES "Barber" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Barber_nickname_key" ON "Barber"("nickname");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_invoiceNo_key" ON "Transaction"("invoiceNo");

-- CreateIndex
CREATE UNIQUE INDEX "Attendance_barberId_date_key" ON "Attendance"("barberId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "CashDay_date_key" ON "CashDay"("date");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollLine_periodId_barberId_key" ON "PayrollLine"("periodId", "barberId");

