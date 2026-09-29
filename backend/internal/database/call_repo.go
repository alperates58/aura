package database

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"aura/internal/models"
	"github.com/google/uuid"
)

type CallRepository struct {
	db *sql.DB
}

func NewCallRepository(db *sql.DB) *CallRepository {
	return &CallRepository{db: db}
}

func (r *CallRepository) CreateCallLog(ctx context.Context, convID, callerID, receiverID uuid.UUID, callType, status string) (*models.CallLog, error) {
	now := time.Now()
	log := &models.CallLog{
		ID:             uuid.New(),
		ConversationID: convID,
		CallerID:       callerID,
		ReceiverID:     receiverID,
		CallType:       callType,
		Status:         status,
		StartedAt:      &now,
		CreatedAt:      now,
	}

	query := `
		INSERT INTO call_logs (id, conversation_id, caller_id, receiver_id, call_type, status, started_at, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING id, created_at
	`
	err := r.db.QueryRowContext(ctx, query, log.ID, log.ConversationID, log.CallerID, log.ReceiverID, log.CallType, log.Status, log.StartedAt, log.CreatedAt).
		Scan(&log.ID, &log.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("cagri kaydi olusturulamadi: %w", err)
	}

	return log, nil
}

func (r *CallRepository) UpdateCallStatus(ctx context.Context, callID uuid.UUID, status string, durationSeconds int) error {
	now := time.Now()
	query := `
		UPDATE call_logs
		SET status = $1, duration_seconds = $2, ended_at = $3
		WHERE id = $4
	`
	_, err := r.db.ExecContext(ctx, query, status, durationSeconds, now, callID)
	return err
}

func (r *CallRepository) GetCallLogs(ctx context.Context, convID uuid.UUID, limit int) ([]models.CallLog, error) {
	if limit <= 0 || limit > 50 {
		limit = 20
	}

	query := `
		SELECT id, conversation_id, caller_id, receiver_id, call_type, status, started_at, ended_at, duration_seconds, created_at
		FROM call_logs
		WHERE conversation_id = $1
		ORDER BY created_at DESC
		LIMIT $2
	`
	rows, err := r.db.QueryContext(ctx, query, convID, limit)
	if err != nil {
		return nil, fmt.Errorf("cagri kayitlari alinamadi: %w", err)
	}
	defer rows.Close()

	var logs []models.CallLog
	for rows.Next() {
		var l models.CallLog
		if err := rows.Scan(
			&l.ID, &l.ConversationID, &l.CallerID, &l.ReceiverID,
			&l.CallType, &l.Status, &l.StartedAt, &l.EndedAt, &l.DurationSeconds, &l.CreatedAt,
		); err != nil {
			return nil, err
		}
		logs = append(logs, l)
	}

	if logs == nil {
		logs = []models.CallLog{}
	}
	return logs, nil
}

func (r *CallRepository) GetCallByID(ctx context.Context, callID uuid.UUID) (*models.CallLog, error) {
	query := `
		SELECT id, conversation_id, caller_id, receiver_id, call_type, status, started_at, ended_at, duration_seconds, created_at
		FROM call_logs
		WHERE id = $1
		LIMIT 1
	`
	var l models.CallLog
	err := r.db.QueryRowContext(ctx, query, callID).Scan(
		&l.ID, &l.ConversationID, &l.CallerID, &l.ReceiverID,
		&l.CallType, &l.Status, &l.StartedAt, &l.EndedAt, &l.DurationSeconds, &l.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &l, nil
}

func (r *CallRepository) GetActiveCalls(ctx context.Context) ([]models.CallLog, error) {
	query := `
		SELECT id, conversation_id, caller_id, receiver_id, call_type, status, started_at, ended_at, duration_seconds, created_at
		FROM call_logs
		WHERE status IN ('ringing', 'accepted', 'active')
		ORDER BY created_at DESC
		LIMIT 20
	`
	rows, err := r.db.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("aktif cagri kayitlari alinamadi: %w", err)
	}
	defer rows.Close()

	var logs []models.CallLog
	for rows.Next() {
		var l models.CallLog
		if err := rows.Scan(
			&l.ID, &l.ConversationID, &l.CallerID, &l.ReceiverID,
			&l.CallType, &l.Status, &l.StartedAt, &l.EndedAt, &l.DurationSeconds, &l.CreatedAt,
		); err != nil {
			return nil, err
		}
		logs = append(logs, l)
	}

	if logs == nil {
		logs = []models.CallLog{}
	}
	return logs, nil
}
