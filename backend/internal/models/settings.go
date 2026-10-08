package models

type SiteInfoSettings struct {
	SiteName          string `json:"site_name"`
	SiteTagline       string `json:"site_tagline"`
	SiteURL           string `json:"site_url"`
	LogoURL           string `json:"logo_url"`
	AllowRegistration bool   `json:"allow_registration"`
	DefaultTheme      string `json:"default_theme"`
	MaintenanceMode   bool   `json:"maintenance_mode"`
}

type MediaLimitsSettings struct {
	MaxFileSizeMB     int      `json:"max_file_size_mb"`
	AllowedExtensions []string `json:"allowed_extensions"`
	MaxVoiceSeconds   int      `json:"max_voice_seconds"`
	EnableCompression bool     `json:"enable_compression"`
}

type ChatSettings struct {
	AllowMessageEdit            bool `json:"allow_message_edit"`
	EditTimeLimitMinutes        int  `json:"edit_time_limit_minutes"`
	AllowDeleteForAll           bool `json:"allow_delete_for_all"`
	DeleteTimeLimitMinutes      int  `json:"delete_time_limit_minutes"`
	DisappearingMessagesDefault int      `json:"disappearing_messages_default"`
	EnableLinkPreviews          bool     `json:"enable_link_previews"`
	EnableSocialEmbeds          bool     `json:"enable_social_embeds"`
	BannedWords                 []string `json:"banned_words"`
}

type CallSettings struct {
	EnableAudioCalls       bool `json:"enable_audio_calls"`
	EnableVideoCalls       bool `json:"enable_video_calls"`
	EnableScreenShare      bool `json:"enable_screen_share"`
	MaxCallDurationMinutes int  `json:"max_call_duration_minutes"`
}

type SecuritySettings struct {
	MaxMessagesPerSecond      int    `json:"max_messages_per_second"`
	MaxMessagesPerMinute      int    `json:"max_messages_per_minute"`
	RequireStrongPasswords    bool   `json:"require_strong_passwords"`
	LockoutAttempts           int    `json:"lockout_attempts"`
	SessionTimeoutDays        int    `json:"session_timeout_days"`
	InactivityLogoutEnabled   bool   `json:"inactivity_logout_enabled"`
	InactivityTimeoutMinutes  int    `json:"inactivity_timeout_minutes"`
	InactivityRedirectURL     string `json:"inactivity_redirect_url"`
	InactivityScheduleEnabled bool   `json:"inactivity_schedule_enabled"`
	InactivityWeekdayStart     string `json:"inactivity_weekday_start"`
	InactivityWeekdayEnd       string `json:"inactivity_weekday_end"`
	InactivityWeekendFull      bool   `json:"inactivity_weekend_full"`
	EnableAssistiveTouch      bool   `json:"enable_assistive_touch"`
	AssistiveTouchOpacity     int    `json:"assistive_touch_opacity"`
	AssistiveTouchDefaultPos  string `json:"assistive_touch_default_pos"`
	AssistiveTouchRedirectURL string `json:"assistive_touch_redirect_url"`
	EnableTripleTapEscape     bool   `json:"enable_triple_tap_escape"`
	EnableDoubleTapMenu       bool   `json:"enable_double_tap_menu"`
}

type NotificationSettings struct {
	EnableWebPush     bool   `json:"enable_web_push"`
	EnableSoundAlerts bool   `json:"enable_sound_alerts"`
	VapidPublicKey    string `json:"vapid_public_key"`
}

type ThemeSettings struct {
	PrimaryColor   string `json:"primary_color"`
	CardBg         string `json:"card_bg"`
	NavBg          string `json:"nav_bg"`
	MainBg         string `json:"main_bg"`
	BorderColor    string `json:"border_color"`
	OutgoingBubble string `json:"outgoing_bubble"`
	OutgoingText   string `json:"outgoing_text,omitempty"`
	IncomingBubble string `json:"incoming_bubble"`
	FontFamily     string `json:"font_family"`
	BorderRadius   string `json:"border_radius"`
}

type PublicSettingsResponse struct {
	SiteInfo         SiteInfoSettings    `json:"site_info"`
	ThemeSettings    ThemeSettings       `json:"theme_settings"`
	MediaLimits      MediaLimitsSettings `json:"media_limits"`
	ChatSettings     ChatSettings        `json:"chat_settings"`
	CallSettings     CallSettings        `json:"call_settings"`
	SecuritySettings SecuritySettings    `json:"security_settings"`
}
