use anyhow::{anyhow, Context, Result};
use serde::{Deserialize, Serialize};

use crate::config::AppState;

#[derive(Debug, Deserialize)]
struct EmbeddingsResponse {
    data: Vec<EmbeddingDatum>,
}

#[derive(Debug, Deserialize)]
struct EmbeddingDatum {
    embedding: Vec<f32>,
}

pub async fn embed_query(st: &AppState, query: &str) -> Result<Vec<f32>> {
    #[derive(Serialize)]
    struct EmbReq<'a> {
        model: &'a str,
        input: Vec<&'a str>,
    }
    let url = format!("{}/embeddings", st.cfg.llm_base_url);
    let resp = st
        .http
        .post(url)
        .bearer_auth(&st.cfg.llm_api_key)
        .json(&EmbReq {
            model: &st.cfg.embedding_model,
            input: vec![query],
        })
        .send()
        .await
        .context("Embedding request failed")?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(anyhow!("Embedding API error: {} - {}", status, body));
    }
    let data: EmbeddingsResponse = resp.json().await.context("Invalid embeddings JSON")?;
    let v = data
        .data
        .into_iter()
        .next()
        .ok_or_else(|| anyhow!("Embedding API returned no vectors"))?
        .embedding;
    Ok(v)
}

pub async fn llm_answer(
    st: &AppState, 
    query: &str, 
    context: &str, 
    speaker_profile: Option<&str>,
    speaker2_profile: Option<&str>,
    speaker_name: Option<&str>,
    speaker2_name: Option<&str>,
) -> Result<String> {
    #[derive(Serialize)]
    struct ChatReq<'a> {
        model: &'a str,
        messages: Vec<ChatMsg<'a>>,
        temperature: f32,
    }
    #[derive(Serialize)]
    struct ChatMsg<'a> {
        role: &'a str,
        content: &'a str,
    }

    #[derive(Deserialize)]
    struct ChatResp {
        choices: Vec<ChatChoice>,
    }
    #[derive(Deserialize)]
    struct ChatChoice {
        message: ChatChoiceMsg,
    }
    #[derive(Deserialize)]
    struct ChatChoiceMsg {
        content: String,
    }

    let (system, user_prompt) = if let (Some(profile1), Some(profile2), Some(name1), Some(name2)) = 
        (speaker_profile, speaker2_profile, speaker_name, speaker2_name) {
        // Discussion/debate mode with two speakers
        let system = format!(
            "You are orchestrating a NATURAL, RELAXED DISCUSSION between two people with the following profiles. \
            Create an authentic conversation where they discuss the topic based ONLY on the provided SOURCES.\n\n\
            SPEAKER 1 ({}):\n{}\n\n\
            SPEAKER 2 ({}):\n{}\n\n\
            CRITICAL RULES FOR ATTRIBUTION:\n\
            - Each speaker can ONLY use information from their OWN transcript lines in the SOURCES\n\
            - When {} speaks, use ONLY lines marked with '{}: ...'\n\
            - When {} speaks, use ONLY lines marked with '{}: ...'\n\
            - NEVER mix up who said what - check the speaker label in the transcript carefully\n\
            - If a speaker doesn't have relevant information in their lines, have them acknowledge this or ask the other speaker\n\
            - Each speaker's arguments must be based on what THEY actually said in the transcripts, not what the other person said\n\n\
            CONVERSATION STYLE - MAKE IT NATURAL:\n\
            - Write as if this is a REAL, spontaneous conversation between friends\n\
            - Use casual, flowing language - avoid overly formal or structured speech\n\
            - Let speakers interrupt, overlap, or build on each other's thoughts naturally\n\
            - Include natural discourse markers from their profiles (\"also\", \"ja\", \"ne\", etc.)\n\
            - Don't make every turn too balanced - some responses can be short, others longer\n\
            - Let the conversation flow organically - not every point needs a counter-point\n\
            - Use ellipses (...) for trailing thoughts or interruptions\n\
            - Include reactions like agreements, laughter references, or brief acknowledgments\n\
            - Stay in character with each speaker's unique personality, vocabulary, and humor style\n\
            - Format: Simply use speaker names followed by colon (e.g., '{}: <text>')\n\n\
            CITATIONS - MANDATORY BUT NATURAL:\n\
            - ALWAYS cite sources when making factual claims: (Episode 281, 12:38-17:19)\n\
            - Citations are REQUIRED for facts, data, or specific information from transcripts\n\
            - Place citations at the end of statements, not after every phrase\n\
            - Short reactions or agreements don't need citations (\"Ja genau\", \"Stimmt schon\")\n\
            - But any substantive point MUST be cited\n\
            - Answer in German unless the user asks otherwise",
            name1, profile1, name2, profile2, name1, name1, name2, name2, name1
        );
        
        let user_prompt = format!(
            "QUESTION:\n{}\n\nSOURCES:\n{}\n\n\
            IMPORTANT REMINDER:\n\
            - {} can ONLY talk about things {} said (look for '{}: ...' in the sources)\n\
            - {} can ONLY talk about things {} said (look for '{}: ...' in the sources)\n\
            - Create a natural, flowing discussion - not a formal debate\n\
            - Make it sound like a real conversation between friends discussing an interesting topic\n\
            - DO NOT assign one person's arguments to the other person\n\
            - ALWAYS include episode citations in format: (Episode 123, 12:34-56:78) when stating facts",
            query, context, name1, name1, name1, name2, name2, name2
        );
        
        (system, user_prompt)
    } else if let Some(profile) = speaker_profile {
        // Single speaker persona mode
        let system = format!(
            "You are roleplaying as a fictional person described in the following speaker profile. \
            Answer the user's question using ONLY the provided SOURCES (transcript excerpts), \
            but deliver the answer in the voice, style, and personality described in the profile below.\n\n\
            SPEAKER PROFILE:\n{}\n\n\
            IMPORTANT:\n\
            - Stay in character throughout your response\n\
            - Use the vocabulary, phrases, and speech patterns from the profile\n\
            - Match the humor style and attitude described\n\
            - If the sources don't contain enough information, say so in character\n\
            - Include citations inline like: (Episode 281, 12:38-17:19)\n\
            - Answer in German unless the user asks otherwise",
            profile
        );
        
        let user_prompt = format!(
            "QUESTION:\n{}\n\nSOURCES:\n{}\n\n\
            Remember: Answer this question as the person from the speaker profile, \
            using their typical vocabulary, style, and humor. Use only information from the sources.",
            query, context
        );
        
        (system, user_prompt)
    } else {
        // Neutral mode (original behavior)
        let system = "You are a helpful RAG assistant. Answer the user's question using ONLY the provided SOURCES (transcript excerpts). If the sources do not contain enough information, say so explicitly. When you make a factual claim, cite it inline like: (Episode 281, 12:38-17:19). Keep the answer concise and in German unless the user asks otherwise.".to_string();
        
        let user_prompt = format!(
            "QUESTION:\n{query}\n\nSOURCES:\n{context}\n\nINSTRUCTIONS:\n- Use the sources only.\n- Prefer quoting short phrases when helpful.\n- Include citations with episode number and time window.\n"
        );
        
        (system, user_prompt)
    };

    let url = format!("{}/chat/completions", st.cfg.llm_base_url);
    let resp = st
        .http
        .post(url)
        .bearer_auth(&st.cfg.llm_api_key)
        .json(&ChatReq {
            model: &st.cfg.llm_model,
            messages: vec![
                ChatMsg {
                    role: "system",
                    content: &system,
                },
                ChatMsg {
                    role: "user",
                    content: &user_prompt,
                },
            ],
            temperature: 0.2,
        })
        .send()
        .await
        .context("Chat request failed")?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(anyhow!("Chat API error: {} - {}", status, body));
    }

    let data: ChatResp = resp.json().await.context("Invalid chat JSON")?;
    let content = data
        .choices
        .into_iter()
        .next()
        .ok_or_else(|| anyhow!("Chat API returned no choices"))?
        .message
        .content;
    Ok(content.trim().to_string())
}



