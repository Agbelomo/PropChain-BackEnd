import { Injectable } from '@nestjs/common';
import {
  TransactionResponseDto,
  TransactionStatusDto,
  TransactionTypeDto,
  FeeBreakdown,
} from './dto/transaction.dto';

@Injectable()
export class TransactionMapper {
  toResponseDto(transaction: any): TransactionResponseDto {
    return {
      id: transaction.id,
      propertyId: transaction.propertyId,
      buyerId: transaction.buyerId,
      sellerId: transaction.sellerId,
      amount: Number(transaction.amount),
      type: transaction.type as TransactionTypeDto,
      status: transaction.status as TransactionStatusDto,
      blockchainHash: transaction.blockchainHash ?? undefined,
      contractAddress: transaction.contractAddress ?? undefined,
      notes: transaction.notes ?? undefined,
      feeBreakdown: (transaction.feeBreakdown as unknown as FeeBreakdown) ?? undefined,
      escrowStatus: transaction.escrowStatus ?? undefined,
      escrowAmount: transaction.escrowAmount ?? undefined,
      paymentStatus: transaction.paymentStatus ?? undefined,
      createdAt: transaction.createdAt,
      updatedAt: transaction.updatedAt,
    };
  }
}
