package com.memoryreel;

import org.junit.Test; // junit:4.13.2
import static org.junit.Assert.*; // junit:4.13.2

/**
 * Example unit test class demonstrating unit test setup, patterns, and best practices 
 * for the MemoryReel Android application.
 * 
 * This class serves as a reference implementation for:
 * - Basic test structure and organization
 * - AAA (Arrange-Act-Assert) pattern usage
 * - JUnit test annotations and assertions
 * - Test documentation standards
 */
public class ExampleUnitTest {

    /**
     * Default constructor for test class initialization.
     */
    public ExampleUnitTest() {
        // Default constructor - no initialization required for this example
    }

    /**
     * Example test method demonstrating basic unit test structure using the
     * AAA (Arrange-Act-Assert) pattern.
     * 
     * Test validates that basic arithmetic operations work as expected,
     * serving as a template for more complex test implementations.
     */
    @Test
    public void addition_isCorrect() {
        // Arrange
        int firstNumber = 2;
        int secondNumber = 2;
        int expectedResult = 4;

        // Act
        int actualResult = firstNumber + secondNumber;

        // Assert
        assertEquals("Basic arithmetic addition should work correctly",
                    expectedResult, actualResult);
    }
}