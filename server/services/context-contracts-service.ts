/**
 * Context Contracts Service
 * Provides full auditability trail linking clips to prompts, models, and decision rationale.
 * Every AI decision is recorded with provenance for complete traceability.
 */

import { db } from '../db';
import { contextContracts, type ContextContract, type InsertContextContract } from '@shared/schema';
import { eq, and, gte, lte, desc, sql, inArray } from 'drizzle-orm';

export interface ContractDecision {
  stage: 'prompt_generation' | 'caci_injection' | 'model_selection' | 'validation' | 'retry' | 'final';
  timestamp: Date;
  model: string;
  modelVersion: string;
  input: string;
  output: string;
  rationale: string;
  confidence: number;
  alternatives?: Array<{ option: string; score: number; reason: string }>;
}

export interface ContractAdjustment {
  adjustmentId: string;
  type: string;
  description: string;
}

export interface ContractInputContext {
  originalPrompt: string;
  tnaId?: string;
  lyricText?: string;
  timestamp: { start: number; end: number };
}

export interface ContractOutput {
  finalPrompt: string;
  videoPath?: string;
  qualityScore?: number;
  narrativeScore?: number;
  passed: boolean;
}

export interface ContractQueryFilters {
  packageId?: string;
  jobId?: string;
  clipIndex?: number;
  dateFrom?: Date;
  dateTo?: Date;
  minQualityScore?: number;
  model?: string;
  passed?: boolean;
}

export interface AuditReport {
  packageId: string;
  summary: {
    totalContracts: number;
    passedContracts: number;
    failedContracts: number;
    totalCost: number;
    totalDuration: number;
    avgQualityScore: number;
    avgNarrativeScore: number;
    totalRetries: number;
  };
  costBreakdown: {
    stage: string;
    cost: number;
    percentage: number;
  }[];
  modelUsage: {
    model: string;
    count: number;
    avgConfidence: number;
  }[];
  decisionTimeline: {
    contractId: string;
    clipIndex: number;
    decisions: {
      stage: string;
      timestamp: Date;
      model: string;
      confidence: number;
    }[];
  }[];
  adjustmentsApplied: {
    adjustmentId: string;
    type: string;
    timesApplied: number;
    clipIndices: number[];
  }[];
}

interface InMemoryContract {
  id: string;
  packageId: string;
  jobId: string;
  clipIndex: number;
  inputContext: ContractInputContext;
  decisions: ContractDecision[];
  appliedAdjustments: ContractAdjustment[];
  output?: ContractOutput;
  provenance: {
    createdAt: Date;
    completedAt?: Date;
    totalDuration: number;
    apiCost: number;
    retryCount: number;
  };
}

class ContextContractsService {
  private inProgressContracts: Map<string, InMemoryContract> = new Map();

  /**
   * Create a new context contract for a clip
   */
  async createContract(
    packageId: string,
    jobId: string,
    clipIndex: number,
    inputContext?: Partial<ContractInputContext>,
  ): Promise<string> {
    const contractId = `contract_${packageId}_${clipIndex}_${Date.now()}`;

    const contract: InMemoryContract = {
      id: contractId,
      packageId,
      jobId,
      clipIndex,
      inputContext: {
        originalPrompt: inputContext?.originalPrompt || '',
        tnaId: inputContext?.tnaId,
        lyricText: inputContext?.lyricText,
        timestamp: inputContext?.timestamp || { start: 0, end: 0 },
      },
      decisions: [],
      appliedAdjustments: [],
      provenance: {
        createdAt: new Date(),
        totalDuration: 0,
        apiCost: 0,
        retryCount: 0,
      },
    };

    this.inProgressContracts.set(contractId, contract);
    console.log(`📝 Created context contract: ${contractId} for clip ${clipIndex}`);

    return contractId;
  }

  /**
   * Update the input context for a contract
   */
  updateInputContext(contractId: string, inputContext: Partial<ContractInputContext>): void {
    const contract = this.inProgressContracts.get(contractId);
    if (!contract) {
      console.warn(`⚠️ Contract not found: ${contractId}`);
      return;
    }

    contract.inputContext = {
      ...contract.inputContext,
      ...inputContext,
    };
  }

  /**
   * Record a decision in the contract's audit trail
   */
  recordDecision(contractId: string, decision: Omit<ContractDecision, 'timestamp'>): void {
    const contract = this.inProgressContracts.get(contractId);
    if (!contract) {
      console.warn(`⚠️ Contract not found for decision: ${contractId}`);
      return;
    }

    const fullDecision: ContractDecision = {
      ...decision,
      timestamp: new Date(),
    };

    contract.decisions.push(fullDecision);

    if (decision.stage === 'retry') {
      contract.provenance.retryCount++;
    }

    console.log(
      `📋 Recorded ${decision.stage} decision for contract ${contractId} (model: ${decision.model}, confidence: ${decision.confidence}%)`,
    );
  }

  /**
   * Record an applied adjustment from the self-reflection system
   */
  recordAdjustment(contractId: string, adjustmentId: string, type: string, description: string): void {
    const contract = this.inProgressContracts.get(contractId);
    if (!contract) {
      console.warn(`⚠️ Contract not found for adjustment: ${contractId}`);
      return;
    }

    contract.appliedAdjustments.push({
      adjustmentId,
      type,
      description,
    });

    console.log(`🔧 Applied adjustment ${adjustmentId} (${type}) to contract ${contractId}`);
  }

  /**
   * Add cost to the contract's provenance
   */
  addCost(contractId: string, cost: number): void {
    const contract = this.inProgressContracts.get(contractId);
    if (!contract) return;

    contract.provenance.apiCost += cost;
  }

  /**
   * Finalize a contract with output results and persist to database
   */
  async finalizeContract(contractId: string, output: ContractOutput): Promise<ContextContract | null> {
    const contract = this.inProgressContracts.get(contractId);
    if (!contract) {
      console.warn(`⚠️ Cannot finalize - contract not found: ${contractId}`);
      return null;
    }

    contract.output = output;
    contract.provenance.completedAt = new Date();
    contract.provenance.totalDuration =
      contract.provenance.completedAt.getTime() - contract.provenance.createdAt.getTime();

    try {
      const insertData: InsertContextContract = {
        contractId: contract.id,
        packageId: contract.packageId,
        jobId: contract.jobId,
        clipIndex: contract.clipIndex,
        inputContext: contract.inputContext,
        decisions: contract.decisions.map((d) => ({
          ...d,
          timestamp: d.timestamp.toISOString(),
        })),
        appliedAdjustments: contract.appliedAdjustments,
        output: contract.output,
        finalPrompt: output.finalPrompt,
        videoPath: output.videoPath,
        qualityScore: output.qualityScore,
        narrativeScore: output.narrativeScore,
        passed: output.passed,
        createdAt: contract.provenance.createdAt,
        completedAt: contract.provenance.completedAt,
        totalDuration: contract.provenance.totalDuration,
        apiCost: contract.provenance.apiCost.toString(),
        retryCount: contract.provenance.retryCount,
      };

      const [result] = await db.insert(contextContracts).values(insertData).returning();

      this.inProgressContracts.delete(contractId);

      console.log(
        `✅ Finalized contract ${contractId}: passed=${output.passed}, cost=$${contract.provenance.apiCost.toFixed(4)}, duration=${(contract.provenance.totalDuration / 1000).toFixed(1)}s`,
      );

      return result;
    } catch (error) {
      console.error(`❌ Failed to persist contract ${contractId}:`, error);
      return null;
    }
  }

  /**
   * Get a single contract by ID
   */
  async getContract(contractId: string): Promise<ContextContract | null> {
    const inProgress = this.inProgressContracts.get(contractId);
    if (inProgress) {
      return this.inMemoryToDbFormat(inProgress);
    }

    const results = await db
      .select()
      .from(contextContracts)
      .where(eq(contextContracts.contractId, contractId))
      .limit(1);

    return results[0] || null;
  }

  /**
   * Query contracts with filters
   */
  async queryContracts(filters: ContractQueryFilters): Promise<ContextContract[]> {
    const conditions = [];

    if (filters.packageId) {
      conditions.push(eq(contextContracts.packageId, filters.packageId));
    }
    if (filters.jobId) {
      conditions.push(eq(contextContracts.jobId, filters.jobId));
    }
    if (filters.clipIndex !== undefined) {
      conditions.push(eq(contextContracts.clipIndex, filters.clipIndex));
    }
    if (filters.dateFrom) {
      conditions.push(gte(contextContracts.createdAt, filters.dateFrom));
    }
    if (filters.dateTo) {
      conditions.push(lte(contextContracts.createdAt, filters.dateTo));
    }
    if (filters.minQualityScore !== undefined) {
      conditions.push(gte(contextContracts.qualityScore, filters.minQualityScore));
    }
    if (filters.passed !== undefined) {
      conditions.push(eq(contextContracts.passed, filters.passed));
    }

    const query =
      conditions.length > 0
        ? db
            .select()
            .from(contextContracts)
            .where(and(...conditions))
        : db.select().from(contextContracts);

    const results = await query.orderBy(desc(contextContracts.createdAt)).limit(1000);

    if (filters.model) {
      return results.filter((c) => c.decisions?.some((d: any) => d.model === filters.model));
    }

    return results;
  }

  /**
   * Generate a comprehensive audit report for a package
   */
  async generateAuditReport(packageId: string): Promise<AuditReport> {
    const contracts = await this.queryContracts({ packageId });

    if (contracts.length === 0) {
      return {
        packageId,
        summary: {
          totalContracts: 0,
          passedContracts: 0,
          failedContracts: 0,
          totalCost: 0,
          totalDuration: 0,
          avgQualityScore: 0,
          avgNarrativeScore: 0,
          totalRetries: 0,
        },
        costBreakdown: [],
        modelUsage: [],
        decisionTimeline: [],
        adjustmentsApplied: [],
      };
    }

    const passed = contracts.filter((c) => c.passed);
    const failed = contracts.filter((c) => !c.passed);

    const totalCost = contracts.reduce((sum, c) => sum + parseFloat(c.apiCost || '0'), 0);
    const totalDuration = contracts.reduce((sum, c) => sum + (c.totalDuration || 0), 0);

    const qualityScores = contracts.map((c) => c.qualityScore).filter((s): s is number => s !== null);
    const narrativeScores = contracts.map((c) => c.narrativeScore).filter((s): s is number => s !== null);

    const avgQualityScore =
      qualityScores.length > 0 ? qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length : 0;
    const avgNarrativeScore =
      narrativeScores.length > 0 ? narrativeScores.reduce((a, b) => a + b, 0) / narrativeScores.length : 0;

    const totalRetries = contracts.reduce((sum, c) => sum + (c.retryCount || 0), 0);

    const stageCosts = new Map<string, number>();
    const modelStats = new Map<string, { count: number; totalConfidence: number }>();

    for (const contract of contracts) {
      const decisions = (contract.decisions as unknown as ContractDecision[]) || [];
      for (const decision of decisions) {
        const stage = decision.stage;
        stageCosts.set(stage, (stageCosts.get(stage) || 0) + parseFloat(contract.apiCost || '0') / decisions.length);

        const model = decision.model;
        const existing = modelStats.get(model) || { count: 0, totalConfidence: 0 };
        modelStats.set(model, {
          count: existing.count + 1,
          totalConfidence: existing.totalConfidence + decision.confidence,
        });
      }
    }

    const costBreakdown = Array.from(stageCosts.entries()).map(([stage, cost]) => ({
      stage,
      cost,
      percentage: totalCost > 0 ? (cost / totalCost) * 100 : 0,
    }));

    const modelUsage = Array.from(modelStats.entries()).map(([model, stats]) => ({
      model,
      count: stats.count,
      avgConfidence: stats.count > 0 ? stats.totalConfidence / stats.count : 0,
    }));

    const decisionTimeline = contracts.map((c) => ({
      contractId: c.contractId,
      clipIndex: c.clipIndex,
      decisions: ((c.decisions as unknown as ContractDecision[]) || []).map((d) => ({
        stage: d.stage,
        timestamp: new Date(d.timestamp),
        model: d.model,
        confidence: d.confidence,
      })),
    }));

    const adjustmentMap = new Map<string, { type: string; clipIndices: number[] }>();
    for (const contract of contracts) {
      const adjustments = (contract.appliedAdjustments as ContractAdjustment[]) || [];
      for (const adj of adjustments) {
        const existing = adjustmentMap.get(adj.adjustmentId);
        if (existing) {
          existing.clipIndices.push(contract.clipIndex);
        } else {
          adjustmentMap.set(adj.adjustmentId, {
            type: adj.type,
            clipIndices: [contract.clipIndex],
          });
        }
      }
    }

    const adjustmentsApplied = Array.from(adjustmentMap.entries()).map(([id, data]) => ({
      adjustmentId: id,
      type: data.type,
      timesApplied: data.clipIndices.length,
      clipIndices: data.clipIndices,
    }));

    return {
      packageId,
      summary: {
        totalContracts: contracts.length,
        passedContracts: passed.length,
        failedContracts: failed.length,
        totalCost,
        totalDuration,
        avgQualityScore,
        avgNarrativeScore,
        totalRetries,
      },
      costBreakdown,
      modelUsage,
      decisionTimeline,
      adjustmentsApplied,
    };
  }

  /**
   * Get contracts for a specific job
   */
  async getContractsForJob(jobId: string): Promise<ContextContract[]> {
    return this.queryContracts({ jobId });
  }

  /**
   * Get in-progress contracts (not yet finalized)
   */
  getInProgressContracts(): InMemoryContract[] {
    return Array.from(this.inProgressContracts.values());
  }

  /**
   * Clean up old in-progress contracts (older than 24 hours)
   */
  cleanupStaleContracts(): number {
    const staleThreshold = Date.now() - 24 * 60 * 60 * 1000;
    let cleaned = 0;

    for (const [id, contract] of this.inProgressContracts.entries()) {
      if (contract.provenance.createdAt.getTime() < staleThreshold) {
        this.inProgressContracts.delete(id);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`🧹 Cleaned up ${cleaned} stale context contracts`);
    }

    return cleaned;
  }

  private inMemoryToDbFormat(contract: InMemoryContract): ContextContract {
    return {
      id: contract.id,
      contractId: contract.id,
      packageId: contract.packageId,
      jobId: contract.jobId,
      clipIndex: contract.clipIndex,
      inputContext: contract.inputContext,
      decisions: contract.decisions as any,
      appliedAdjustments: contract.appliedAdjustments,
      output: contract.output || null,
      finalPrompt: contract.output?.finalPrompt || null,
      videoPath: contract.output?.videoPath || null,
      qualityScore: contract.output?.qualityScore || null,
      narrativeScore: contract.output?.narrativeScore || null,
      passed: contract.output?.passed || false,
      createdAt: contract.provenance.createdAt,
      completedAt: contract.provenance.completedAt || null,
      totalDuration: contract.provenance.totalDuration,
      apiCost: contract.provenance.apiCost.toString(),
      retryCount: contract.provenance.retryCount,
      updatedAt: new Date(),
    };
  }
}

export const contextContractsService = new ContextContractsService();
