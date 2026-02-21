package dev.creesch.storage;

import static dev.creesch.model.WebsocketMessageBuilder.createHistoricChatMessage;

import com.google.gson.Gson;
import dev.creesch.model.ChatMessagePayload;
import dev.creesch.model.WebsocketJsonMessage;
import dev.creesch.util.NamedLogger;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.*;
import java.util.ArrayList;
import java.util.List;
import net.fabricmc.loader.api.FabricLoader;
import org.sqlite.SQLiteDataSource;

public class ChatMessageRepository {

    private static final NamedLogger LOGGER = new NamedLogger("web-chat");
    private SQLiteDataSource dataSource;
    private static final Gson gson = new Gson();
    private boolean initialized = false;

    // DB constants
    private static final String DB_NAME = "chat_messages.db";
    private static final String DATA_DIR = "web-chat";
    private static final int CURRENT_SCHEMA_VERSION = 3;

    // SQL queries
    private static final String CREATE_MESSAGES_TABLE_QUERY = """
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp BIGINT NOT NULL,
            server_id TEXT NOT NULL,
            server_name TEXT NOT NULL,
            message_id TEXT NOT NULL,
            message_json TEXT NOT NULL,
            translations_json TEXT NOT NULL DEFAULT '{}',
            is_ping BOOLEAN NOT NULL,
            minecraft_version TEXT
        )
        """;

    private static final String CREATE_INDEX_QUERY = """
        CREATE INDEX IF NOT EXISTS idx_server_id_timestamp ON messages(server_id, timestamp DESC)
        """;

    private static final String CREATE_VERSION_TABLE_QUERY = """
        CREATE TABLE IF NOT EXISTS schema_version (
            version INTEGER PRIMARY KEY
        )
        """;

    private static final String SELECT_SCHEMA_VERSION_QUERY = """
        SELECT version FROM schema_version
        """;

    private static final String INSERT_SCHEMA_VERSION_QUERY = """
        INSERT INTO schema_version (version) VALUES (?)
        """;

    private static final String INSERT_MESSAGE_QUERY = """
        INSERT INTO messages (
            timestamp,
            server_id,
            server_name,
            message_id,
            message_json,
            translations_json,
            is_ping,
            minecraft_version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """;

    // Base query, needs formatting
    private static final String BASE_GET_MESSAGE_QUERY = """
        SELECT
            timestamp,
            server_id,
            server_name,
            message_id,
            message_json,
            translations_json,
            is_ping,
            minecraft_version
        FROM
            messages
        WHERE
            server_id = ?
        %s
        ORDER BY
            timestamp DESC
        LIMIT
            ?
        """;

    private static final String V2_MIGRATION_QUERY = """
        ALTER TABLE messages ADD COLUMN translations_json TEXT NOT NULL DEFAULT '{}';

        UPDATE schema_version SET version = 2;
        """;

    private static final String V3_MIGRATION_QUERY = """
        ALTER TABLE messages RENAME COLUMN translations_json TO translations_json_old;
        ALTER TABLE messages ADD COLUMN translations_json TEXT NOT NULL DEFAULT '{}';
        UPDATE messages SET translations_json = translations_json_old;
        ALTER TABLE messages DROP COLUMN translations_json_old;

        UPDATE schema_version SET version = 3;
        """;

    public ChatMessageRepository() {
        try {
            Path databasePath = FabricLoader.getInstance()
                .getGameDir()
                .resolve(DATA_DIR)
                .resolve(DB_NAME);

            Files.createDirectories(databasePath.getParent());

            dataSource = new SQLiteDataSource();
            dataSource.setUrl("jdbc:sqlite:" + databasePath);
            initializeDatabase();
            initialized = true;
        } catch (IOException e) {
            LOGGER.error(
                "Failed to create data for web-chat database directory",
                e
            );
        } catch (RuntimeException e) {
            LOGGER.error(
                "A critical error occurred during ChatMessageRepository initialization",
                e
            );
        }
    }

    private void initializeDatabase() {
        try (Connection conn = dataSource.getConnection()) {
            conn.createStatement().execute(CREATE_MESSAGES_TABLE_QUERY);

            // Create composite index for server_id + timestamp queries
            conn.createStatement().execute(CREATE_INDEX_QUERY);

            // Version table
            conn.createStatement().execute(CREATE_VERSION_TABLE_QUERY);

            // Check schema
            checkSchemaVersion(conn);
        } catch (SQLException e) {
            LOGGER.error("Failed to initialize chat storage database", e);
            // Forward the exception to the constructor's try-catch block
            throw new RuntimeException(
                "Failed to initialize chat storage database",
                e
            );
        }
    }

    // To be used for future migrations as well. Does a rollback if the migration fails.
    private void executeMigrationQuery(Connection conn, String migrationQuery)
        throws SQLException {
        LOGGER.info("Executing migration query {}", migrationQuery);
        conn.setAutoCommit(false);
        try {
            conn.createStatement().executeUpdate(migrationQuery);
            conn.commit();
            LOGGER.info("Migration completed successfully");
        } catch (SQLException e) {
            conn.rollback();
            LOGGER.error("Migration failed", e);
            throw e;
        } finally {
            conn.setAutoCommit(true);
        }
    }

    private void checkSchemaVersion(Connection conn) throws SQLException {
        try (
            Statement stmt = conn.createStatement();
            ResultSet rs = stmt.executeQuery(SELECT_SCHEMA_VERSION_QUERY)
        ) {
            if (!rs.next()) {
                // New database, set current version
                try (
                    PreparedStatement insertStmt = conn.prepareStatement(
                        INSERT_SCHEMA_VERSION_QUERY
                    )
                ) {
                    insertStmt.setInt(1, CURRENT_SCHEMA_VERSION);
                    insertStmt.execute();
                }
                return; // Don't need to do anything else here.
            }

            int dbVersion = rs.getInt("version");

            // Mod was likely downgraded from a version with a newer schema.
            if (dbVersion > CURRENT_SCHEMA_VERSION) {
                LOGGER.error(
                    "Database schema version {} is newer than supported version {}",
                    dbVersion,
                    CURRENT_SCHEMA_VERSION
                );
                // Forward the exception to the constructor's try-catch block
                throw new RuntimeException(
                    "Database schema version " +
                        dbVersion +
                        " is newer than supported version " +
                        CURRENT_SCHEMA_VERSION
                );
            }

            // Version 2 migration - Add translations_json column
            if (dbVersion < 2) {
                LOGGER.info("Migrating database to version 2");
                executeMigrationQuery(conn, V2_MIGRATION_QUERY);
            }

            // Version 3 migration - add DEFAULT '{}' to translations_json for
            // users that never ran schema v1
            if (dbVersion < 3) {
                LOGGER.info("Migrating database to version 3");
                executeMigrationQuery(conn, V3_MIGRATION_QUERY);
            }
        }
    }

    // TODO: keep eye on performance.
    // If needed implement a queuing mechanism to do messages in chuncks and transactions.
    public void saveMessage(WebsocketJsonMessage message) {
        if (!initialized || dataSource == null) {
            LOGGER.error(
                "Unable to save message, message database not available."
            );
            return;
        }
        try (
            Connection conn = dataSource.getConnection();
            PreparedStatement statement = conn.prepareStatement(
                INSERT_MESSAGE_QUERY
            )
        ) {
            // Cast payload to ChatMessagePayload since we need to access some info
            Object rawPayload = message.getPayload();
            if (!(rawPayload instanceof ChatMessagePayload payload)) {
                LOGGER.warn(
                    "Attempted to save a message with an invalid payload type."
                );
                return;
            }

            statement.setLong(1, message.getTimestamp());
            statement.setString(2, message.getServer().getIdentifier());
            statement.setString(3, message.getServer().getName());
            statement.setString(4, payload.getUuid());
            statement.setString(5, payload.getComponent().toString());
            statement.setString(6, gson.toJson(payload.getTranslations()));
            statement.setBoolean(7, payload.isPing());
            statement.setString(8, message.getMinecraftVersion());

            statement.executeUpdate();
        } catch (SQLException e) {
            LOGGER.error("Failed to save chat message", e);
        }
    }

    public List<WebsocketJsonMessage> getMessages(String serverId, int limit) {
        return getMessages(serverId, limit, null);
    }

    public List<WebsocketJsonMessage> getMessages(
        String serverId,
        int limit,
        Long beforeTimestamp
    ) {
        if (!initialized || dataSource == null) {
            LOGGER.warn(
                "ChatMessageRepository not properly initialized, returning empty message list"
            );
            return new ArrayList<>();
        }
        List<WebsocketJsonMessage> messages = new ArrayList<>();

        String query = BASE_GET_MESSAGE_QUERY.formatted(
            beforeTimestamp != null ? "AND timestamp < ?" : ""
        );

        try (
            Connection conn = dataSource.getConnection();
            PreparedStatement stmt = conn.prepareStatement(query)
        ) {
            stmt.setString(1, serverId);

            if (beforeTimestamp != null) {
                stmt.setLong(2, beforeTimestamp);
                stmt.setInt(3, limit);
            } else {
                stmt.setInt(2, limit);
            }

            try (ResultSet rs = stmt.executeQuery()) {
                while (rs.next()) {
                    long timestamp = rs.getLong("timestamp");
                    String serverName = rs.getString("server_name");
                    String messageId = rs.getString("message_id");
                    String messageJson = rs.getString("message_json");
                    String translationsJson = rs.getString("translations_json");
                    boolean isPing = rs.getBoolean("is_ping");
                    String minecraftVersion = rs.getString("minecraft_version");

                    messages.add(
                        createHistoricChatMessage(
                            timestamp,
                            serverId,
                            serverName,
                            messageId,
                            messageJson,
                            translationsJson,
                            isPing,
                            minecraftVersion
                        )
                    );
                }
            }
        } catch (SQLException e) {
            // Just throw an error here, no reason to crash the game over this.
            LOGGER.error(
                "Failed to retrieve chat messages for server: {}",
                serverId
            );
        }
        LOGGER.info("Got {} messages", messages.size());
        return messages;
    }
}
