# TriBond Answer Checking

Combining **fuzzy matching**, **synonym matching**, and **storing multiple valid answers** can create a robust system for checking user inputs in a free-text scenario like the **TriBond** game. This document explains the structure and logic for this hybrid approach, focusing on both the backend (Supabase) and frontend (Angular) components.

## High-Level Overview

1. **Store multiple valid answers** in the Supabase database for each question, including:
    1. Correct answers
    2. Common variations (plural forms, abbreviations)
    3. Synonyms (optional)
2. **Fuzzy matching** compares user input to stored answers to handle minor typos and variations.
3. **Synonym matching** checks whether user input is a synonym of the correct answer using an external API or pre-generated synonym lists.

## Supabase Backend Setup

### Database Structure

1. **TriBond Questions Table**:
    1. `id`: Unique ID for the question.
    2. `question_items`: An array of items for the game (e.g., `[The Moon, A Basketball, A Clock]`).
2. **TriBond Answers Table**:
    1. `id`: Unique ID for the answer.
    2. `question_id`: Foreign key linking to the `Questions` table.
    3. `correct_answer`: The main correct answer.
    4. `answer_variations`: An array of acceptable answer variations (synonyms, plural forms, etc.).

```sql
CREATE TABLE questions (
	id serial PRIMARY KEY,
  question_text TEXT[] NOT NULL -- Array of question items
);

CREATE TABLE answers (
 id serial PRIMARY KEY,
 question_id INT REFERENCES questions(id),
 correct_answer TEXT NOT NULL,
 answer_variations TEXT[] -- Array of valid answer variations
);
```

1. **Sample Data**:
    
    Let's say we have a TriBond where the answer is "round." We'll store the main correct answer and variations (synonyms like "circular," "spherical").
    
    ```sql
    INSERT INTO questions (question_items)
    VALUES (ARRAY['The Moon', 'A Basketball', 'A Clock']);
    
    INSERT INTO answers (question_id, correct_answer, answer_variations)
    VALUES (1, 'round', ARRAY['circular', 'spherical', 'ball-shaped']);
    ```
    

## Backend Logic for Answer Checking

Create a **Supabase Function** to validate the user's answer using a combination of:

1. **Exact/case-insensitive match** against the correct answer and stored variations.
2. **Fuzzy matching** to allow for small typos.
3. **Synonym matching** using an external API.

### Step 1: Case-Insensitive Exact Matching

Use SQL to check the user's input against the correct answer and all variations stored in the `answer_variations` array.

```sql
CREATE OR REPLACE FUNCTION check_answer(question_id INT, user_input TEXT)
RETURNS BOOLEAN AS $$
DECLARE
	correct BOOLEAN := FALSE;
BEGIN
	-- Case-insensitive match for exact answer and variations
	SELECT TRUE
	INTO correct
	FROM answers
	WHERE question_id = question_id
		AND (LOWER(correct_answer) = LOWER(TRIM(user_input))
		OR LOWER(TRIM(user_input)) = ANY(SELECT UNNEST(answer_variations)));
	
	RETURN correct;
END;
$$ LANGUAGE plpgsql;
```

### Step 2: Fuzzy Matching (Levenshtein Distance)

The **Levenshtein distance** can be calculated directly in SQL to perform fuzzy matching. This helps to allow for minor typos.

```sql
CREATE OR REPLACE FUNCTION fuzzy_match(question_id INT, user_input TEXT)
RETURNS BOOLEAN AS $$
DECLARE
	correct BOOLEAN := FALSE;
BEGIN
	-- Fuzzy match with a Levenshtein distance threshold of 2
	SELECT TRUE
	INTO correct
	FROM answers
	WHERE question_id = question_id
		AND LEAST(
					levenshtein(LOWER(correct_answer), LOWER(TRIM(user_input))),
		      MIN(levenshtein(LOWER(variation), LOWER(TRIM(user_input))))
		    ) <= 2
	FROM answers, UNNEST(answer_variations) AS variation;
	
	RETURN correct;
END;
$$ LANGUAGE plpgsql;
```

### Step 3: Synonym Matching

A **server-side function** or an external **API** (like Datamuse or WordNet) can be used to check whether the user’s input is a synonym of the correct answer.

In Supabase, the API can be called directly (if using Supabase Functions) or it can be called from a **Node.js** backend.

Example of calling the **Datamuse API** to fetch synonyms:

```tsx
async function fetchSynonyms(word) {
	const response = await fetch(`https://api.datamuse.com/words?ml=${word}`);
	const data = await response.json();
	return data.map((entry) => entry.word);
}

async function isSynonymMatch(userInput, correctAnswer) {
  const synonyms = await fetchSynonyms(correctAnswer);
  return synonyms.includes(userInput.trim().toLowerCase());
}
```

## Frontend (Angular) Integration

### Angular Service for Answer Validation

Create a service in Angular that will:

1. Send the user’s input to Supabase (via an API or directly using Supabase’s client SDK).
2. Check the answer against the stored correct answer and variations.
3. Optionally, use the synonym API for further matching.

```tsx
import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service'; // Service for interacting with Supabase

@Injectable({
  providedIn: 'root'
})
export class AnswerService {
	private supabase = inject(SupabaseService);

  async checkAnswer(questionId: number, userInput: string): Promise<boolean> {
    // Step 1: Check against exact answers in Supabase (could be handled server-side)
    const { data, error } = await this.supabase
      .from('answers')
      .select('*')
      .eq('question_id', questionId);

    if (error || !data.length) return false;

    const correctAnswer = data[0].correct_answer;
    const answerVariations = data[0].answer_variations;

    // Step 2: Check for case-insensitive match (could be handled server-side)
    if (
      correctAnswer.trim().toLowerCase() === userInput.trim().toLowerCase() ||
      answerVariations.includes(userInput.trim().toLowerCase())
    ) {
      return true;
    }

    // Step 3: Fuzzy matching (could be handled server-side)
    if (this.isFuzzyMatch(userInput, correctAnswer) || answerVariations.some((variation) => this.isFuzzyMatch(userInput, variation))) {
      return true;
    }

    // Step 4: Synonym matching (external API)
    const synonymMatch = await this.isSynonymMatch(userInput, correctAnswer);
    if (synonymMatch) {
      return true;
    }

    return false;
  }

  isFuzzyMatch(userInput: string, correctAnswer: string): boolean {
    const levenshteinDistance = this.levenshtein(userInput.trim().toLowerCase(), correctAnswer.trim().toLowerCase());
    return levenshteinDistance <= 2; // Adjust threshold based on leniency
  }

  levenshtein(a: string, b: string): number {
    // Implementation of the Levenshtein distance algorithm
  }

  async isSynonymMatch(userInput: string, correctAnswer: string): Promise<boolean> {
    const synonyms = await fetchSynonyms(correctAnswer);
    return synonyms.includes(userInput.trim().toLowerCase());
  }
}

```

## Combining Everything

1. **Backend**: Store all variations of answers in the database and use **fuzzy matching** and **synonym checking** as fallbacks in case exact matches fail.
2. **Frontend**: The Angular service will call the Supabase function to compare the user’s input against correct answers, then run fuzzy matching and synonym checking if needed.

## Conclusion

By combining:

- **Exact matching** for stored correct answers and variations.
- **Fuzzy matching** for typo tolerance.
- **Synonym matching** using an external API.

We can ensure that the game is both user-friendly and flexible enough to handle different ways users might express the correct answer. This hybrid approach should be effective for handling free-text inputs in a web-based version of a game like **TriBond**.